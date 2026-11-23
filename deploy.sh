#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s [STACK_NAME [AWS_REGION]]\n' "${0##*/}"
  printf 'Defaults: gradeai-staging-v3 us-east-1\n'
}
if [[ ${1:-} == -h || ${1:-} == --help ]]; then
  usage
  exit 0
fi
if (( $# > 2 )); then
  usage >&2
  exit 2
fi

stack_name=${1:-gradeai-staging-v3}
stack_region=${2:-us-east-1}
cd "$(dirname "${BASH_SOURCE[0]}")"

for command_name in aws sam node npm jq make; do
  if ! command -v "$command_name" >/dev/null; then
    printf 'Required command is missing: %s\n' "$command_name" >&2
    exit 1
  fi
done
if [[ $(uname -m) != x86_64 ]]; then
  printf 'Run this script in an x86_64 environment to build the GradeAI Lambda layers.\n' >&2
  exit 1
fi
aws sts get-caller-identity --region "$stack_region" --output json >/dev/null

if ! python3.12 -m pip --version >/dev/null 2>&1; then
  if ! command -v dnf >/dev/null || ! command -v sudo >/dev/null; then
    printf 'Install Python 3.12 with pip, then run this script again.\n' >&2
    exit 1
  fi
  printf 'Installing Python 3.12 and pip for this session.\n'
  sudo dnf install -y python3.12 python3.12-pip
  python3.12 -m pip --version
fi

deploy_dir=$(mktemp -d /tmp/gradeai-deploy.XXXXXX)
trap 'rm -rf -- "$deploy_dir"' EXIT

printf 'Building Lambda functions and layers for %s in %s.\n' "$stack_name" "$stack_region"
PIP_NO_CACHE_DIR=1 sam build --template-file template.yaml --no-cached \
  --build-dir "$deploy_dir/sam-build" --cache-dir "$deploy_dir/sam-cache"

parameter_overrides=()
if [[ -n ${GRADEAI_UNLIMITED_TRIAL:-} ]]; then
  parameter_overrides=(--parameter-overrides "UnlimitedTrial=$GRADEAI_UNLIMITED_TRIAL")
fi

sam deploy --template-file "$deploy_dir/sam-build/template.yaml" \
  --stack-name "$stack_name" --region "$stack_region" \
  --config-env staging-defaults --resolve-s3 --capabilities CAPABILITY_IAM \
  --confirm-changeset --no-fail-on-empty-changeset "${parameter_overrides[@]}"

# Keep node_modules, Vite output, and npm's download cache off CloudShell's home filesystem.
mkdir "$deploy_dir/frontend"
cp -R frontend/deploy.sh frontend/index.html frontend/package.json \
  frontend/package-lock.json frontend/src "$deploy_dir/frontend/"
npm_config_cache="$deploy_dir/npm-cache" \
  "$deploy_dir/frontend/deploy.sh" "$stack_name" "$stack_region"
