#!/usr/bin/env bash
set -euo pipefail

stack_name=${1:?Usage: ./frontend/deploy.sh STACK_NAME AWS_REGION}
stack_region=${2:?Supply the AWS region}
cd "$(dirname "$0")"

stack_outputs=$(aws cloudformation describe-stacks --stack-name "$stack_name" --region "$stack_region" \
  --query 'Stacks[0].Outputs' --output json)
out() {
  local value
  if ! value=$(jq -er --arg key "$1" --arg legacy "${2:-}" '
    (. // []) | (map(select(.OutputKey == $key))[0] //
                 map(select(.OutputKey == $legacy))[0]) | .OutputValue
  ' <<< "$stack_outputs"); then
    printf 'Missing stack output %s. Check that %s in %s finished deploying.\n'       "$1" "$stack_name" "$stack_region" >&2
    return 1
  fi
  printf '%s\n' "$value"
}
VITE_API_URL=$(out ApiUrl)
VITE_POOL_ID=$(out PoolId)
VITE_CLIENT_ID=$(out ClientId)
VITE_MONTHLY_NAME=$(out MonthlyName)
VITE_YEARLY_NAME=$(out YearlyName)
VITE_MONTHLY_PRICE=$(out FrontendMonthlyDisplayPrice MonthlyDisplayPrice)
VITE_YEARLY_PRICE=$(out FrontendYearlyDisplayPrice YearlyDisplayPrice)
VITE_MONTHLY_QUOTA=$(out FrontendMonthlyQuota MonthlyQuota)
VITE_YEARLY_QUOTA=$(out FrontendYearlyQuota YearlyQuota)
export VITE_API_URL VITE_POOL_ID VITE_CLIENT_ID VITE_MONTHLY_NAME VITE_YEARLY_NAME
export VITE_MONTHLY_PRICE VITE_YEARLY_PRICE VITE_MONTHLY_QUOTA VITE_YEARLY_QUOTA
site_bucket=$(out SiteBucket)
distribution=$(out DistributionId)

npm ci --no-audit --no-fund
npm run build
aws s3 sync dist/assets/ "s3://$site_bucket/assets/" --region "$stack_region" \
  --cache-control 'public,max-age=31536000,immutable'
aws s3 cp dist/index.html "s3://$site_bucket/index.html" --region "$stack_region" \
  --cache-control 'no-store,max-age=0,must-revalidate' --content-type 'text/html; charset=utf-8'
invalidation=$(aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*' \
  --query 'Invalidation.Id' --output text)
aws cloudfront wait invalidation-completed --distribution-id "$distribution" --id "$invalidation"
out SiteUrl
