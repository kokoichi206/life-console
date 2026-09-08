"""実 provider の plan / apply を使い、Web だけの更新をローカル API で検証する。"""

from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from threading import Thread


class WorkerUploadAPI(BaseHTTPRequestHandler):
    uploads = 0

    def log_message(self, *_args):
        pass

    def respond(self, result):
        body = json.dumps({"success": True, "errors": [], "result": result}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        self.rfile.read(int(self.headers["Content-Length"]))
        assert self.path.endswith("/assets-upload-session"), self.path
        self.respond({"jwt": "local-test-assets", "buckets": []})

    def do_PUT(self):
        assert self.path.endswith("/workers/scripts/local-test"), self.path
        body = self.rfile.read(int(self.headers["Content-Length"]))
        headers = f'Content-Type: {self.headers["Content-Type"]}\r\n\r\n'.encode()
        multipart = BytesParser(policy=default).parsebytes(headers + body)
        metadata = json.loads(next(
            part.get_payload(decode=True) for part in multipart.iter_parts()
            if part.get_param("name", header="content-disposition") == "metadata"
        ))
        WorkerUploadAPI.uploads += 1
        self.respond({
            **metadata,
            "id": "local-test",
            # 同じ Worker コードでも、再配置すると起動時間は変わる。
            "startup_time_ms": 61 + WorkerUploadAPI.uploads * 3,
            "created_on": "2026-09-01T00:00:00Z",
            "modified_on": f"2026-09-09T00:00:{WorkerUploadAPI.uploads:02d}Z",
            "has_assets": True,
            "has_modules": True,
        })


def verify_updates(sandbox, provider_directory, api_port):
    terraform_source = Path(__file__).resolve().parents[1]
    terraform_root = sandbox / "infra/terraform"
    shutil.copytree(terraform_source / "modules", terraform_root / "modules")
    root = terraform_root / "envs/test"
    root.mkdir(parents=True)
    for app, fixture in [("api", "index.js"), ("web", "index.html")]:
        dist = sandbox / f"apps/{app}/dist"
        dist.mkdir(parents=True)
        shutil.copyfile(terraform_source / f"tests/fixtures/{fixture}", dist / fixture)
    shutil.copyfile(
        terraform_source / "envs/development/.terraform.lock.hcl",
        root / ".terraform.lock.hcl",
    )
    provider = (terraform_source / "envs/development/provider.tf").read_text()
    provider = provider.replace('provider "cloudflare" {}', f'''
provider "cloudflare" {{
  base_url  = "http://127.0.0.1:{api_port}/"
  api_token = "{'a' * 40}"
}}
''')
    (root / "main.tf").write_text(provider + '''
module "worker" {
  source            = "../../modules/services/worker"
  account_id        = "00000000000000000000000000000000"
  worker_name       = "local-test"
  environment       = "development"
  database_id       = "00000000-0000-0000-0000-000000000001"
  photo_bucket_name = "local-test-photos"
}
''')

    def terraform(*arguments):
        result = subprocess.run(
            ["terraform", f"-chdir={root}", *arguments],
            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60,
        )
        if result.returncode:
            raise AssertionError(result.stdout)
        return result.stdout

    terraform("init", "-backend=false", "-input=false", "-lockfile=readonly",
              f"-plugin-dir={provider_directory}")
    # Cron や公開 URL を扱わず、Worker 更新時の計算属性だけを実 provider で確認する。
    target = "-target=module.worker.cloudflare_workers_script.app"
    terraform("apply", "-auto-approve", "-refresh=false", target)

    def plan_update():
        terraform("plan", "-input=false", "-refresh=false", target, "-out=update.tfplan")
        plan = json.loads(terraform("show", "-json", "update.tfplan"))
        return next(
            resource["change"] for resource in plan["resource_changes"]
            if resource["address"] == "module.worker.cloudflare_workers_script.app"
        )

    def apply_update():
        change = plan_update()
        assert change["actions"] == ["update"], change
        assert change["after_unknown"]["startup_time_ms"], change
        assert change["before"]["annotations"]["workers_tag"] != change["after"]["annotations"]["workers_tag"]
        terraform("apply", "-input=false", "update.tfplan")
        assert plan_update()["actions"] == ["no-op"]

    assert plan_update()["actions"] == ["no-op"]
    (sandbox / "apps/web/dist/index.html").write_text("<html>changed assets only</html>")
    apply_update()
    added_asset = sandbox / "apps/web/dist/added.txt"
    added_asset.write_text("new asset")
    apply_update()
    added_asset.unlink()
    apply_update()
    (sandbox / "apps/api/dist/index.js").write_text("export default { fetch() { return new Response('updated'); } };\n")
    apply_update()
    assert WorkerUploadAPI.uploads == 5
    print("Worker updates: Web change / addition / deletion, API change, and unchanged plans passed.")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="life-console-worker-") as temporary:
        with ThreadingHTTPServer(("127.0.0.1", 0), WorkerUploadAPI) as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                verify_updates(Path(temporary), Path(sys.argv[1]).resolve(), server.server_port)
            finally:
                server.shutdown()
                thread.join()
