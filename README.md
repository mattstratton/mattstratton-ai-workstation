# AI Workstation

Always-on AWS EC2 workstation for TUI-based AI coding agents.

## Pre-Provision Checklist

Run these once before the first `pulumi up`:

### 1. Store GitHub SSH key in Secrets Manager
```bash
aws secretsmanager create-secret \
  --name workstation/github-ssh-key \
  --secret-string "$(cat ~/.ssh/your_github_key)" \
  --region us-east-1
```

### 2. Set SSH public key in Pulumi config
```bash
pulumi config set --secret mattstratton-ai-workstation:ssh-public-key \
  "$(cat ~/.ssh/your_key.pub)"
```

### 3. Verify AWS credentials
```bash
aws sts get-caller-identity
```

To use a named AWS profile:
```bash
pulumi config set aws:profile your-profile-name
```

## Deploy

```bash
npm install
pulumi up --stack dev
```

## Post-Boot Steps (one-time)

After `pulumi up` completes:

```bash
# Get connection info
pulumi stack output sshCommand

# Connect and set up auth
ssh matty@<ip>

# On the remote machine:
claude auth login
me login && me claude install && me codex install
# Open Moshi app → get token:
moshi-hook pair --token <token-from-app> && moshi-hook install && sudo systemctl start moshi-hook
# Tiger Cloud:
tiger --help  # find auth command
# Review dotfiles before bootstrapping:
yadm status
# If safe:
yadm bootstrap
```

## Resize Instance

```bash
pulumi config set mattstratton-ai-workstation:instance-type t3.xlarge
pulumi up --stack dev
```
Note: resize requires stopping the instance (brief downtime).

## Verification

```bash
# SSH connects
$(pulumi stack output sshCommand)

# mosh session works (tests UDP rule)
$(pulumi stack output moshCommand)

# On remote: tools work
claude --version
docker run --rm hello-world
git -C ~/src/github.com/timescale/tiger-den status
tiger --version
me --version
```
