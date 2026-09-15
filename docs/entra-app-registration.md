# Microsoft Entra App Registration

The Container App uses built-in Microsoft Entra authentication. The app registration is intentionally tenant-managed and supplied to Bicep through `ENTRA_CLIENT_ID`.

## Create the registration

Create one single-tenant web application per environment. The client secret is a deployment secret: store it in the matching GitHub Environment secret named `ENTRA_CLIENT_SECRET`, never in source control.

```powershell
$appName = "cwp-analyzer-dev"
$app = az ad app create `
  --display-name $appName `
  --sign-in-audience AzureADMyOrg `
  | ConvertFrom-Json

az ad sp create --id $app.appId

$credential = az ad app credential reset `
  --id $app.appId `
  --append `
  --display-name "container-app-auth" `
  --years 1 `
  | ConvertFrom-Json

azd env set ENTRA_CLIENT_ID $app.appId
azd env set ENTRA_CLIENT_SECRET $credential.password
```

Repeat for production using a separate app registration and credential.

After the first environment provision returns `WEB_URL`, configure the callback and logout URLs:

```powershell
$containerAppUrl = azd env get-value WEB_URL
az ad app update `
  --id $app.appId `
  --web-redirect-uris "$containerAppUrl/.auth/login/aad/callback"
```

Set the front-channel logout URL to `$containerAppUrl/.auth/logout` in the Entra portal. The registration and credential can therefore be created before provisioning; interactive sign-in is verified only after the generated URL is added.

The credential value is returned only when it is created. Save it immediately in the `dev` or `prod` GitHub Environment as the `ENTRA_CLIENT_SECRET` secret. Set an owner and expiry reminder, then rotate it before expiration by adding a replacement credential, updating the environment secret, redeploying, and removing the old credential.

## Required configuration

- Account type: accounts in this organizational directory only.
- Platform: Web.
- Redirect URI: `https://<host>/.auth/login/aad/callback`.
- Front-channel logout URL: `https://<host>/.auth/logout`.
- ID tokens enabled.
- The client secret is supplied through a secure Bicep parameter and stored as a Container App secret named `microsoft-provider-authentication-secret`.
- The client secret is never stored in the repository, workflow variables, or command output.
- Conditional Access and MFA are managed by the tenant.

## Local development

Container Apps built-in authentication is not active locally. Local development remains anonymous and should use synthetic/non-sensitive Bicep only.
