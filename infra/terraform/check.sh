#!/usr/bin/env bash
set -euo pipefail

terraform_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
terraform fmt -check -recursive "$terraform_root"

# 実運用 backend と import 設定を、資格情報なしの mock 検証に混ぜない。
check_directory="$(mktemp -d)"
trap 'rm -rf "$check_directory"' EXIT
while IFS= read -r configuration_file; do
  mkdir -p "$check_directory/$(dirname "$configuration_file")"
  cp "$terraform_root/$configuration_file" "$check_directory/$configuration_file"
done < <(cd "$terraform_root" && rg --files --hidden \
  -g '*.tf' -g '*.hcl' -g '!**/.terraform/**' \
  -g '!**/imports.tf' -g '!**/backend.hcl')

for configuration in envs/shared envs/development envs/production modules/platform/owner-policy modules/services/owner-access modules/services/runner-access; do
  configuration_directory="$check_directory/$configuration"
  terraform -chdir="$configuration_directory" init -backend=false -input=false -lockfile=readonly
  terraform -chdir="$configuration_directory" validate -no-color
  terraform -chdir="$configuration_directory" test -no-color
done
