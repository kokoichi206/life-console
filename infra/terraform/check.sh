#!/usr/bin/env bash
set -euo pipefail

terraform_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
terraform fmt -check -recursive "$terraform_root"

# 実運用 backend と import 設定を、資格情報なしの mock 検証に混ぜない。
check_directory="$(mktemp -d)"
trap 'rm -rf "$check_directory"' EXIT
git -C "$terraform_root" ls-files --cached --others --exclude-standard -- '*.tf' '*.hcl' \
  > "$check_directory/configuration-files"
while IFS= read -r configuration_file; do
  mkdir -p "$check_directory/$(dirname "$configuration_file")"
  cp "$terraform_root/$configuration_file" "$check_directory/$configuration_file"
done < "$check_directory/configuration-files"

for configuration in bootstrap/state-storage envs/development envs/production; do
  configuration_directory="$check_directory/$configuration"
  terraform -chdir="$configuration_directory" init -backend=false -input=false -lockfile=readonly
  terraform -chdir="$configuration_directory" validate -no-color
  terraform -chdir="$configuration_directory" test -no-color
done
