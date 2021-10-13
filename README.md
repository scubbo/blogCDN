# Deployment

## First Time

* Get a Personal Access Token for your Github account:
  * Go [here](https://github.com/settings/tokens), and click "Generate New Token".
  * Sign in.
  * Give the token whatever name you want, and check "`admin:repo_hook`" and "`repo`". Click "Generate".
  * Store the resultant token - you can only view it once, and you'll need it later.
  * (TODO - see if this can be automated with GitHub REST API).
* Create a Machine User account in GitHub:
  * Run `ssh-keygen -f <output_file> -P ""`
  * Create a new account on GitHub (you can use the "[plus trick](https://www.thewindowsclub.com/gmail-address-tricks)" to reuse your existing email address).
  * In your Machine User account, click the profile icon in the top-right for menu, then "Settings", and "SSH and GPG keys".
  * Click "New SSH Key". Give it an arbitrary title, and paste the content of `<output_file>.pub` in the Key. Click "Add SSH Key".
  * As your main GitHub user, go to your blog content repo in GitHub. Go "Settings" -> "Manage Access", and click "Add People". Type the username of your machine user to invite them.
  * As your machine user, go to your blog content repo, and accept the invitation.
  * Don't delete the output files! You'll need them in the next step, too!
  * (TODO - automate this, too! Though I doubt you can automate setting up the Machine User).
* Save the access secrets from above in AWS:
  * Personal Access Token:
    * Go to [AWS Secrets Manager](https://console.aws.amazon.com/secretsmanager/home).
    * Click "Store a new secret", select "Other type of secret".
    * Select "Plaintext", paste in the Personal Access Token from before as the entire content (i.e. overwrite the existing JSON structure). Click "Next" (DefaultEncryptionKey is fine).
    * Give the secret an arbitrary name (record it for use later!), and then repeatedly click "Next/Store" to create (all defaults are fine).
    * At this point, you no longer need to keep the Personal Access Token stored - it is safely stored in AWS.
  * Machine User:
    * Go to [AWS System Manager Parameter Store](https://console.aws.amazon.com/systems-manager/parameters).
    * Click "Create Parameter". Give the parameter a name like "Github-Machine-User-Public-Key".
    * Keep the default options (Standard Tier, Type: String, Data type: text), and paste the full content of `<output_file>.pub` into the `Value` field
    * Repeat (with appropriate change to name) for the Private key (reading from `<output_file>`)
    * At this point, you can safely delete the SSH key files - they are safely stored in AWS.

First time:

`cdk --profile personal deploy -c user=<GitHub username> -c infraRepo=<infraRepo> -c contentRepo=<contentRepo> -c branch=<branch> -c secretName=<name> -c hostedZoneDomainName=<domainName> -c domainRecord=<domainRecord> -c machineUserPrivateKeyParameterName=<machineUserPrivateKeyParameterName> -c machineUserPublicKeyParameterName=<machineUserPublicKeyParameterName>`

i.e. if you want the blog to be hosted at `blog.mydomain.net`, use `-c hostedZoneDomainName=mydomain.net -c domainRecord=blog`