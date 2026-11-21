# GradeAI

GradeAI lets a parent or guardian upload a photo, PDF, or DOCX and review AI grading with their child. It starts each verified account with five sheets and supports Stripe Checkout and Customer Portal for monthly and annual subscriptions.

## Prerequisites

- An AWS account and a deployment role that can create the resources in [template.yaml](template.yaml), including IAM roles, a WAF web ACL, and a budget. Use a separate test stack and Stripe test mode before launch.
- AWS CLI v2, AWS SAM CLI, Docker for SAM's Lambda build containers, Node.js 22+, and jq.
- A Stripe account and merchant support contact. Set up the two recurring prices in USD, one monthly and one yearly, and configure Customer Portal payment methods and cancellations. For a discounted annual price, set it below 12 times the monthly price. Use one recurring item per subscription.
- A region that supports the selected Bedrock model via on-demand Converse and supports Cognito WAF associations. Nova Lite defaults to `amazon.nova-lite-v1:0`. Check availability and verify invocation with the actual deployment account, including any AWS Marketplace or model-provider setup.

## Deploy

1. In Secrets Manager, create a secret with the following JSON shape. Use test-mode values for staging. You can use a temporary webhook secret to create the stack, then update it with Stripe's endpoint secret before testing billing.

   ```json
   {"secretKey":"sk_test_…","webhookSecret":"whsec_…"}
   ```

   Use the default Secrets Manager encryption key, or grant the three Stripe-using function roles access to decrypt your customer-managed KMS key. Keep both values out of the repository, commands recorded in shell history, and frontend variables.

2. Build and deploy in your chosen region.

   ```bash
   sam validate --lint
   sam build --use-container
   sam deploy --guided --region us-east-1
   ```

   Provide `StripeSecretArn`, `MonthlyPrice`, `YearlyPrice`, `MonthlyDisplayPrice`, `YearlyDisplayPrice`, and `AlertEmail`. Enter the actual recurring amounts for the selected Stripe price IDs. Plan names, quotas, budget threshold, daily cap, and model settings are SAM parameters. Confirm the SNS email subscription. The AWS Budget covers the account's costs. Use a dedicated AWS account or add cost attribution if you need stack-only budget alerts.

3. In Stripe, add the stack's `StripeWebhookUrl` as a webhook endpoint. Select `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, and `invoice.paid`. Use Stripe API version `2025-08-27.basil` where selectable. Replace the temporary `webhookSecret` in Secrets Manager with the actual signing secret. If a Lambda already cached the old secret, recycle its environment or redeploy its configuration before retrying Stripe events. Stripe's dashboard shows delivery outcomes and supports redelivery.

4. Publish the frontend.

   ```bash
   ./frontend/deploy.sh gradeai us-east-1
   ```

   Substitute your stack name and region. The script pulls public endpoint configuration from CloudFormation, builds Vite, uploads immutable assets before index.html, and waits for CloudFront invalidation. Use the returned site URL. Keep prior hashed assets long enough to support already-open tabs.

5. For a custom domain, set `CustomDomain` and `CertificateArn` to an ACM certificate in `us-east-1`. Point the domain at CloudFront with Route 53 A and AAAA alias records, or a CNAME for a subdomain. The same domain becomes the allowed API and upload origin and the Stripe return origin.

Before a public launch, configure a verified SES sender for Cognito if the default Cognito email limits are insufficient. Adapt the Terms, Privacy, and Refund pages to your company, contact information, jurisdiction, and children's privacy obligations.

## Grading and model configuration

The grader uses the Bedrock Converse API for its image and document blocks. DOCX text is extracted using the python-docx Lambda layer. The model grades visible questions from subject knowledge. Code validates the response and scores 10 points for correct, 5 for partial, and 0 for incorrect. An unreadable sheet, malformed model response after retry, or model failure produces an error and releases the reserved allowance.

Set SAM's `ModelId` to a supported Claude Haiku model or another compatible Converse model. SAM puts the value in the grader's `MODEL_ID` environment variable and updates its exact foundation-model resource permission. Update `InputUSDPerMillion`, `OutputUSDPerMillion`, and the attachment limits for the model and region, then redeploy. For a model that requires citations for visual PDF analysis, such as a compatible Claude Haiku model, set `PdfCitations=true` and verify a scanned PDF in staging. For a cross-region inference profile, set `ModelId` to the profile ID, `ModelResourceArn` to the exact inference profile ARN, and `ModelDestinationArns` to a comma-separated list of exact foundation-model ARNs in its destination regions. The default IAM policy permits a single model resource.

The browser's transport ceiling is 20 MiB. The default model's image and PDF block limits are smaller, and the API rejects files above the configured model limits before reserving a sheet. Model token and page limits can also cause a valid-size file to fail. Convert HEIC photos to JPEG and use clear, cropped photos or a short PDF. DOCX supports selectable text and tables. Embedded scans inside DOCX should be uploaded as images or PDFs.

A five-minute S3 PUT URL binds the object key, exact byte length, media type, and `If-None-Match: *`. The browser supplies Content-Length when it uploads a File. The grader only handles an object that matches an existing pending submission. S3 originals expire after 30 days. Answer text and feedback remain in History until deleted. Avoid personal identifiers in document contents and filenames.

## Quotas and state

- The reservation makes one conditional profile update in the same DynamoDB transaction as the per-user daily counter and submission write. Successful results consume the reservation. Failed or abandoned uploads are refunded once. The anti-abuse cap counts all reservations made that UTC day, including failed ones.
- Monthly plans get a new allowance when the verified Stripe subscription reports a new billing period. Annual Stripe subscriptions report a yearly billing period, so annual entitlements use monthly anniversaries inside that verified period, calculated when an API request arrives. The plan stops granting paid allowance at the reported annual end until Stripe confirms renewal. There is no scheduled quota reset. Past-due or canceled subscriptions fall back to any remaining trial allowance.
- The maintenance schedule recovers abandoned uploads and interrupted grading and processes account deletions. Account deletion blocks new requests immediately. Cleanup waits for existing upload URLs to expire, then closes Stripe billing, removes the Cognito user and deletes S3 and DynamoDB account data. Stripe event IDs expire after 35 days and contain no account data.
- Sheet deletion is available after grading resolves. If an upload completes after deletion, the S3 event handler removes the orphaned object.
- Cognito confirms email before the API accepts its ID token. API routes derive ownership exclusively from the verified token's subject. A Cognito WAF rule rate-limits direct signups per IP. Rate limits are approximate.

## Verify the five-sheet trial

1. Register a parent test account, verify the email, and sign in. Check that **5 of 5 free sheets left** appears.
2. Upload five readable answer sheets with known answers. Check the upload and grading states, manually verify points for correct, partial, and incorrect answers, and expand and collapse the results.
3. Confirm the upgrade dialog appears after the fifth completed trial sheet. Submit a sixth file and verify the API returns HTTP 402, opens the pricing dialog, and creates no upload.
4. Use a second account to confirm the first account's submission IDs are inaccessible. Send two simultaneous reservations when a single sheet remains and verify only one succeeds.
5. Use a new account for a corrupt file and an abandoned upload. Verify each reaches an error and returns its allowance. Abandoned uploads can take up to about 20 minutes to resolve. Review the CloudWatch call metrics without logging student answers.
6. In Stripe test mode, subscribe and verify the paid quota, duplicate webhook handling, renewal, and fallback after a past-due or canceled subscription. Use Stripe test clocks where supported by the independent billing test workflow.
7. Delete a finished test submission. Request account deletion and verify the Cognito identity, DynamoDB partition, S3 prefix, and active Stripe subscription are cleared after maintenance runs.

## Cost and admin analytics

The stack publishes aggregate CloudWatch metrics for verified trial signups, finished trial sheets, first paid conversions, failed grading, Bedrock tokens, and estimated AI cost. It counts anonymous usage milestones from one through five completed sheets per trial account. The dashboard shows sheets per trial signup and conversions divided by signups in the plotted period. Those ratios are period aggregates and can include sheets or conversions from earlier signups. Give dashboard and metrics read permissions only to operators through AWS IAM. Application users have no AWS console permissions.

Example estimate at Nova Lite's template rates of $0.06 per million input tokens and $0.24 per million output tokens. At 4,000 input and 1,500 output tokens per successful sheet, one model call costs about **$0.00060**, or **$0.60 for 1,000 sheets**. Image size, PDF pages, retries, and region change actual costs. Verify current model prices before enabling paid billing.

For a small launch in a typical US region, allow roughly **$15–25/month before Stripe fees and taxes**, depending on regional WAF, CloudWatch custom metric/dashboard/alarm, CloudFront, email, and API usage. Lambda, DynamoDB, and S3 charges depend on processing time, item size, and retention. The estimate assumes low traffic and around 1,000 grading calls per month, with low storage and outbound transfer. The budget alert sends email. It does not stop spending.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Cognito email missing | Spam, SES sender and quota, Cognito email delivery, and the PostConfirmation logs. |
| Site loads but uploads fail before PUT | Check the verified session, uploaded size, and that Vite was built with the current stack outputs. |
| S3 returns 403 or CORS error | Use the configured origin, send the same file and signed headers, and complete the upload within five minutes. |
| Grading goes straight to error | Check the grader log for error type, Bedrock model access and availability, and supported PDF/image limits. For scanned work, capture all questions clearly. |
| Checkout completes but plan stays free | Check Stripe delivery status, secret and API mode, configured Price IDs, and Lambda errors. Replay the original webhook after correcting configuration. |
| Dashboard or links return access denied | Confirm the CloudFront origin policy, frontend deployment, and distribution status. |
| Account deletion remains pending | Review maintenance errors and Stripe or Cognito permissions. Cleanup retries while its queue entry remains pending. |

Local frontend preview runs with `npm ci && npm run dev` inside `frontend/`. The marketing and policy pages render without AWS. Account features require AWS configuration and the site origin allowed by the deployed API and S3 bucket.
