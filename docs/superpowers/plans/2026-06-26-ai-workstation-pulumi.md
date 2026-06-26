# AI Workstation Pulumi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision a persistent AWS EC2 AI coding workstation (Ubuntu 24.04, us-east-1) via a Pulumi TypeScript program with full tool bootstrapping via cloud-init.

**Architecture:** A single EC2 instance in the default VPC gets an Elastic IP, a dedicated security group (SSH + mosh), and an IAM role that lets cloud-init fetch the GitHub SSH key from Secrets Manager. Six focused TypeScript modules handle config, IAM, networking, compute, and user-data generation; `index.ts` wires them together and exports stack outputs.

**Tech Stack:** Pulumi TypeScript, `@pulumi/aws` v6, Node.js LTS, mocha + ts-node for unit tests, Pulumi runtime mocks for resource testing.

## Global Constraints

- AWS region: `us-east-1` (configurable via `aws:region`)
- Ubuntu 24.04 LTS AMI from Canonical (`099720109477`)
- Default instance type: `t3.large` (configurable via `instance-type`)
- Default EBS root volume: 100 GB gp3 (configurable via `ebs-size-gb`)
- Linux username: `matty` (configurable via `user-name`)
- `ssh-public-key` is a required Pulumi secret (must be set before `pulumi up`)
- GitHub SSH private key stored in AWS Secrets Manager at path `workstation/github-ssh-key` (configurable)
- Repos cloned into `~/src/github.com/timescale/{tiger-den,marketing-skills,rta-bench-private}`
- yadm dotfiles: clone only, bootstrap NOT run automatically

---

## File Map

| File | Responsibility |
|------|---------------|
| `Pulumi.yaml` | Project metadata, runtime: nodejs |
| `Pulumi.dev.yaml` | Default stack config values |
| `package.json` | Dependencies and test script |
| `tsconfig.json` | TypeScript compiler config |
| `config.ts` | Typed config loading with defaults; `WorkstationConfig` interface |
| `networking.ts` | `createSecurityGroup()` → EC2 security group |
| `iam.ts` | `createInstanceProfile()` → IAM role + profile for Secrets Manager access |
| `userData.ts` | `buildUserData()` → reads template, replaces `__PLACEHOLDER__` markers |
| `compute.ts` | `createCompute()` → AMI lookup, EC2 instance, Elastic IP |
| `index.ts` | Entry point: compose resources, export outputs |
| `scripts/cloud-init.sh` | Bootstrap template with `__PLACEHOLDER__` markers |
| `tests/networking.test.ts` | Security group ingress/egress rules |
| `tests/iam.test.ts` | Role trust policy, policy statement |
| `tests/compute.test.ts` | Instance type, volume size, tags |
| `tests/userData.test.ts` | All placeholders replaced; no `__X__` remains |

---

## Task 1: Project Scaffold

**Files:**
- Create: `Pulumi.yaml`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `scripts/` (empty dir with `.gitkeep`)
- Create: `tests/` (empty dir with `.gitkeep`)

**Interfaces:**
- Produces: compilable project skeleton; `npm test` runs mocha

- [ ] **Step 1: Create Pulumi.yaml**

```yaml
name: mattstratton-ai-workstation
runtime: nodejs
description: AWS EC2 AI workstation for TUI coding agents
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "mattstratton-ai-workstation",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc --noEmit",
    "test": "mocha --timeout 10000 -r ts-node/register 'tests/**/*.test.ts'"
  },
  "dependencies": {
    "@pulumi/pulumi": "^3",
    "@pulumi/aws": "^6"
  },
  "devDependencies": {
    "@types/mocha": "^10",
    "@types/node": "^20",
    "mocha": "^10",
    "ts-node": "^10",
    "typescript": "^5"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2020",
    "module": "commonjs",
    "moduleResolution": "node",
    "sourceMap": true,
    "esModuleInterop": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true
  },
  "include": ["*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create directory placeholders**

```bash
mkdir -p scripts tests
touch scripts/.gitkeep tests/.gitkeep
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Verify TypeScript compiles (nothing to compile yet, but confirm setup)**

```bash
npx tsc --noEmit
```

Expected: exits 0 (no source files yet = no errors).

- [ ] **Step 7: Commit**

```bash
git init
git add Pulumi.yaml package.json package-lock.json tsconfig.json scripts/.gitkeep tests/.gitkeep
git commit -m "chore: scaffold Pulumi TypeScript project"
```

---

## Task 2: Cloud-Init Bootstrap Script

**Files:**
- Create: `scripts/cloud-init.sh`

**Interfaces:**
- Consumes: `__USER_NAME__`, `__GIT_NAME__`, `__GIT_EMAIL__`, `__SSH_PUBLIC_KEY__`, `__GITHUB_SECRET_NAME__`, `__DOTFILES_REPO__`, `__AWS_REGION__` placeholders
- Produces: self-contained bash script; `bash -n` passes

- [ ] **Step 1: Write scripts/cloud-init.sh**

```bash
#!/bin/bash
set -euo pipefail
exec > >(tee /var/log/cloud-init-custom.log) 2>&1

echo "=== AI workstation bootstrap starting ==="

USERNAME="__USER_NAME__"
GIT_NAME="__GIT_NAME__"
GIT_EMAIL="__GIT_EMAIL__"
SSH_PUBLIC_KEY="__SSH_PUBLIC_KEY__"
GITHUB_SECRET_NAME="__GITHUB_SECRET_NAME__"
DOTFILES_REPO="__DOTFILES_REPO__"
AWS_REGION="__AWS_REGION__"

export DEBIAN_FRONTEND=noninteractive

# --- 1. System update ---
apt-get update -y
apt-get upgrade -y -o Dpkg::Options::="--force-confold"

# --- 2. Core packages ---
apt-get install -y \
    git git-extras tmux mosh zsh vim neovim wget curl entr jq tree gnupg \
    ripgrep fd-find htop autojump direnv unzip \
    docker.io docker-compose-plugin \
    golang-go \
    pipx \
    build-essential \
    yadm \
    awscli

# --- 3. Node.js LTS via NodeSource ---
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt-get install -y nodejs

# --- 4. GitHub CLI ---
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
apt-get update -y
apt-get install -y gh

# --- 5. Global npm packages ---
npm install -g @anthropic-ai/claude-code @openai/codex diff-so-fancy

# --- 6. Starship prompt (system-wide) ---
curl -sS https://starship.rs/install.sh | sh -s -- --yes

# --- 7. herdr ---
curl -fsSL https://herdr.dev/install.sh | sh

# --- 8. moshi-hook ---
curl -fsSL https://getmoshi.app/install.sh | sh

# --- 9. tiger-cli ---
TIGER_VERSION=$(curl -sf https://api.github.com/repos/timescale/tiger-cli/releases/latest | jq -r '.tag_name')
curl -fsSL "https://github.com/timescale/tiger-cli/releases/download/${TIGER_VERSION}/tiger-cli_Linux_x86_64.tar.gz" \
    | tar -xz -C /tmp/tiger-install
find /tmp/tiger-install -maxdepth 1 -type f -executable | xargs -I{} mv {} /usr/local/bin/tiger
rm -rf /tmp/tiger-install
chmod +x /usr/local/bin/tiger

# --- 10. zsh plugins ---
mkdir -p /usr/share/zsh-plugins
git clone https://github.com/zsh-users/zsh-autosuggestions \
    /usr/share/zsh-plugins/zsh-autosuggestions
git clone https://github.com/zsh-users/zsh-syntax-highlighting \
    /usr/share/zsh-plugins/zsh-syntax-highlighting

# --- 11. Create user ---
useradd -m -s /usr/bin/zsh -G sudo,docker "${USERNAME}"
echo "${USERNAME} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/${USERNAME}"
chmod 0440 "/etc/sudoers.d/${USERNAME}"

# --- 12. SSH authorized_keys ---
USER_HOME="/home/${USERNAME}"
mkdir -p "${USER_HOME}/.ssh"
chmod 700 "${USER_HOME}/.ssh"
echo "${SSH_PUBLIC_KEY}" > "${USER_HOME}/.ssh/authorized_keys"
chmod 600 "${USER_HOME}/.ssh/authorized_keys"

# --- 13. GitHub SSH private key from Secrets Manager ---
GITHUB_SSH_KEY=$(aws secretsmanager get-secret-value \
    --secret-id "${GITHUB_SECRET_NAME}" \
    --region "${AWS_REGION}" \
    --query SecretString \
    --output text)
printf '%s\n' "${GITHUB_SSH_KEY}" > "${USER_HOME}/.ssh/id_ed25519"
chmod 600 "${USER_HOME}/.ssh/id_ed25519"

cat > "${USER_HOME}/.ssh/config" << 'SSHCONFIG'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    StrictHostKeyChecking accept-new
SSHCONFIG
chmod 600 "${USER_HOME}/.ssh/config"
chown -R "${USERNAME}:${USERNAME}" "${USER_HOME}/.ssh"

# --- 14. Git config ---
sudo -u "${USERNAME}" git config --global user.name "${GIT_NAME}"
sudo -u "${USERNAME}" git config --global user.email "${GIT_EMAIL}"
sudo -u "${USERNAME}" git config --global core.pager "diff-so-fancy | less --tabs=4 -RFX"

# --- 15. User-local tool installs ---
sudo -u "${USERNAME}" bash -c 'curl --proto "=https" --tlsv1.2 -LsSf https://setup.atuin.sh | sh'
sudo -u "${USERNAME}" bash -c 'curl -LsSf https://astral.sh/uv/install.sh | sh'
sudo -u "${USERNAME}" bash -c 'curl -sSfL https://install.memory.build | sh'
sudo -u "${USERNAME}" pipx install thefuck

# --- 16. Clone Timescale repos ---
sudo -u "${USERNAME}" mkdir -p "${USER_HOME}/src/github.com/timescale"
sudo -u "${USERNAME}" git clone git@github.com:timescale/tiger-den.git \
    "${USER_HOME}/src/github.com/timescale/tiger-den"
sudo -u "${USERNAME}" git clone git@github.com:timescale/marketing-skills.git \
    "${USER_HOME}/src/github.com/timescale/marketing-skills"
sudo -u "${USERNAME}" git clone git@github.com:timescale/rta-bench-private.git \
    "${USER_HOME}/src/github.com/timescale/rta-bench-private"

# --- 17. Dotfiles (clone only — bootstrap NOT run, review for Linux compat first) ---
sudo -u "${USERNAME}" yadm clone "${DOTFILES_REPO}"

# --- 18. zshrc (minimal baseline; yadm dotfiles may override) ---
cat > "${USER_HOME}/.zshrc" << 'ZSHRC'
export PATH="$HOME/.local/bin:$HOME/.local/pipx/bin:$HOME/go/bin:/usr/local/bin:$PATH"
source /usr/share/zsh-plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
eval "$(starship init zsh)"
eval "$(atuin init zsh)"
[[ -s /usr/share/autojump/autojump.sh ]] && source /usr/share/autojump/autojump.sh
eval "$(direnv hook zsh)"
eval "$(thefuck --alias)"
# zsh-syntax-highlighting must be last
source /usr/share/zsh-plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
ZSHRC
chown "${USERNAME}:${USERNAME}" "${USER_HOME}/.zshrc"

# --- 19. moshi-hook systemd service ---
cat > /etc/systemd/system/moshi-hook.service << SYSTEMD
[Unit]
Description=Moshi Hook Daemon
After=network.target

[Service]
Type=simple
User=${USERNAME}
ExecStart=/usr/local/bin/moshi-hook serve
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SYSTEMD
systemctl daemon-reload
systemctl enable moshi-hook
# Service won't start cleanly until moshi-hook pair is run manually post-boot

# --- 20. Enable Docker ---
systemctl enable docker
systemctl start docker

echo "=== Bootstrap complete ==="
echo "Post-boot steps:"
echo "  claude auth login"
echo "  me login && me claude install && me codex install"
echo "  moshi-hook pair --token <token-from-app> && moshi-hook install && sudo systemctl start moshi-hook"
echo "  tiger auth  (check tiger --help for exact command)"
echo "  review ~/.config/yadm and run yadm bootstrap if safe"
```

- [ ] **Step 2: Validate bash syntax**

```bash
bash -n scripts/cloud-init.sh
```

Expected: exits 0, no output.

- [ ] **Step 3: Verify all placeholders are present**

```bash
grep -o '__[A-Z_]*__' scripts/cloud-init.sh | sort -u
```

Expected output (7 unique placeholders):
```
__AWS_REGION__
__DOTFILES_REPO__
__GIT_EMAIL__
__GIT_NAME__
__GITHUB_SECRET_NAME__
__SSH_PUBLIC_KEY__
__USER_NAME__
```

- [ ] **Step 4: Commit**

```bash
git add scripts/cloud-init.sh
git commit -m "feat: add cloud-init bootstrap script"
```

---

## Task 3: Config Module

**Files:**
- Create: `config.ts`

**Interfaces:**
- Produces: `WorkstationConfig` interface; `loadConfig(): WorkstationConfig`

- [ ] **Step 1: Write config.ts**

```typescript
import * as pulumi from "@pulumi/pulumi";

export interface WorkstationConfig {
    instanceType: string;
    ebsSizeGb: number;
    userName: string;
    gitName: string;
    gitEmail: string;
    sshPublicKey: pulumi.Output<string>;
    githubSecretName: string;
    dotfilesRepo: string;
    awsRegion: string;
}

export function loadConfig(): WorkstationConfig {
    const config = new pulumi.Config();
    const awsConfig = new pulumi.Config("aws");

    return {
        instanceType: config.get("instance-type") ?? "t3.large",
        ebsSizeGb: config.getNumber("ebs-size-gb") ?? 100,
        userName: config.get("user-name") ?? "matty",
        gitName: config.get("git-name") ?? "Matt Stratton",
        gitEmail: config.get("git-email") ?? "matty@tigerdata.com",
        sshPublicKey: config.requireSecret("ssh-public-key"),
        githubSecretName: config.get("github-secret-name") ?? "workstation/github-ssh-key",
        dotfilesRepo: config.get("dotfiles-repo") ?? "https://github.com/mattstratton/matty-dotfiles",
        awsRegion: awsConfig.get("region") ?? "us-east-1",
    };
}
```

- [ ] **Step 2: Compile check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add config.ts
git commit -m "feat: add typed config module with defaults"
```

---

## Task 4: Networking Module

**Files:**
- Create: `networking.ts`
- Create: `tests/networking.test.ts`

**Interfaces:**
- Consumes: nothing (no config needed — security group is static)
- Produces: `createSecurityGroup(): aws.ec2.SecurityGroup`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/networking.test.ts
import * as assert from "assert";
import * as pulumi from "@pulumi/pulumi";

pulumi.runtime.setMocks(
    {
        newResource: (args: pulumi.runtime.MockResourceArgs) => ({
            id: `${args.name}_id`,
            state: args.inputs,
        }),
        call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
    },
    "dev",
    true,
);

import { createSecurityGroup } from "../networking";

describe("createSecurityGroup", () => {
    let sg: ReturnType<typeof createSecurityGroup>;

    before(() => {
        sg = createSecurityGroup();
    });

    it("allows TCP 22 from everywhere", done => {
        sg.ingress.apply(rules => {
            const rule = (rules as any[]).find(
                r => r.protocol === "tcp" && r.fromPort === 22,
            );
            assert.ok(rule, "missing TCP 22 ingress rule");
            assert.deepStrictEqual(rule.cidrBlocks, ["0.0.0.0/0"]);
            done();
        });
    });

    it("allows UDP 60000-61000 for mosh", done => {
        sg.ingress.apply(rules => {
            const rule = (rules as any[]).find(
                r => r.protocol === "udp" && r.fromPort === 60000,
            );
            assert.ok(rule, "missing UDP 60000 ingress rule");
            assert.strictEqual(rule.toPort, 61000);
            assert.deepStrictEqual(rule.cidrBlocks, ["0.0.0.0/0"]);
            done();
        });
    });

    it("allows all outbound traffic", done => {
        sg.egress.apply(rules => {
            const rule = (rules as any[])[0];
            assert.ok(rule, "missing egress rule");
            assert.strictEqual(rule.protocol, "-1");
            assert.deepStrictEqual(rule.cidrBlocks, ["0.0.0.0/0"]);
            done();
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --grep "createSecurityGroup"
```

Expected: FAIL — `Cannot find module '../networking'`

- [ ] **Step 3: Write networking.ts**

```typescript
import * as aws from "@pulumi/aws";

export function createSecurityGroup(): aws.ec2.SecurityGroup {
    return new aws.ec2.SecurityGroup("workstation-sg", {
        name: "ai-workstation",
        description: "AI workstation: SSH and mosh",
        ingress: [
            {
                protocol: "tcp",
                fromPort: 22,
                toPort: 22,
                cidrBlocks: ["0.0.0.0/0"],
                ipv6CidrBlocks: ["::/0"],
                description: "SSH and herdr",
            },
            {
                protocol: "udp",
                fromPort: 60000,
                toPort: 61000,
                cidrBlocks: ["0.0.0.0/0"],
                ipv6CidrBlocks: ["::/0"],
                description: "mosh (for moshi mobile app)",
            },
        ],
        egress: [
            {
                protocol: "-1",
                fromPort: 0,
                toPort: 0,
                cidrBlocks: ["0.0.0.0/0"],
                ipv6CidrBlocks: ["::/0"],
                description: "All outbound",
            },
        ],
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --grep "createSecurityGroup"
```

Expected: 3 passing.

- [ ] **Step 5: Compile check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add networking.ts tests/networking.test.ts
git commit -m "feat: add security group (SSH + mosh)"
```

---

## Task 5: IAM Module

**Files:**
- Create: `iam.ts`
- Create: `tests/iam.test.ts`

**Interfaces:**
- Consumes: `githubSecretName: string`
- Produces: `createInstanceProfile(githubSecretName: string): aws.iam.InstanceProfile`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/iam.test.ts
import * as assert from "assert";
import * as pulumi from "@pulumi/pulumi";

pulumi.runtime.setMocks(
    {
        newResource: (args: pulumi.runtime.MockResourceArgs) => ({
            id: `${args.name}_id`,
            state: args.inputs,
        }),
        call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
    },
    "dev",
    true,
);

import { createInstanceProfile } from "../iam";

describe("createInstanceProfile", () => {
    it("creates a profile backed by an EC2-assumable role", done => {
        const profile = createInstanceProfile("workstation/github-ssh-key");
        // Instance profile should have a name
        profile.name.apply(name => {
            assert.ok(name, "profile should have a name");
            done();
        });
    });

    it("returns an InstanceProfile resource", () => {
        const profile = createInstanceProfile("workstation/github-ssh-key");
        assert.ok(profile instanceof pulumi.CustomResource);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --grep "createInstanceProfile"
```

Expected: FAIL — `Cannot find module '../iam'`

- [ ] **Step 3: Write iam.ts**

```typescript
import * as aws from "@pulumi/aws";

export function createInstanceProfile(
    githubSecretName: string,
): aws.iam.InstanceProfile {
    const role = new aws.iam.Role("workstation-role", {
        name: "ai-workstation-role",
        assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Action: "sts:AssumeRole",
                    Effect: "Allow",
                    Principal: { Service: "ec2.amazonaws.com" },
                },
            ],
        }),
    });

    new aws.iam.RolePolicy("workstation-secret-policy", {
        role: role.name,
        policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Effect: "Allow",
                    Action: ["secretsmanager:GetSecretValue"],
                    Resource: `arn:aws:secretsmanager:*:*:secret:${githubSecretName}*`,
                },
            ],
        }),
    });

    return new aws.iam.InstanceProfile("workstation-profile", {
        name: "ai-workstation-profile",
        role: role.name,
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --grep "createInstanceProfile"
```

Expected: 2 passing.

- [ ] **Step 5: Compile check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add iam.ts tests/iam.test.ts
git commit -m "feat: add IAM role and instance profile for Secrets Manager access"
```

---

## Task 6: UserData Module

**Files:**
- Create: `userData.ts`
- Create: `tests/userData.test.ts`

**Interfaces:**
- Consumes: `WorkstationConfig` from `config.ts`
- Produces: `buildUserData(cfg: WorkstationConfig): pulumi.Output<string>`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/userData.test.ts
import * as assert from "assert";
import * as pulumi from "@pulumi/pulumi";

pulumi.runtime.setMocks(
    {
        newResource: (args: pulumi.runtime.MockResourceArgs) => ({
            id: `${args.name}_id`,
            state: args.inputs,
        }),
        call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
    },
    "dev",
    true,
);

import { buildUserData } from "../userData";
import { WorkstationConfig } from "../config";

const testConfig: WorkstationConfig = {
    instanceType: "t3.large",
    ebsSizeGb: 100,
    userName: "testuser",
    gitName: "Test User",
    gitEmail: "test@example.com",
    sshPublicKey: pulumi.output("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 test"),
    githubSecretName: "test/github-key",
    dotfilesRepo: "https://github.com/test/dotfiles",
    awsRegion: "us-east-1",
};

describe("buildUserData", () => {
    it("returns a Pulumi Output", () => {
        const result = buildUserData(testConfig);
        assert.ok(result instanceof pulumi.Output);
    });

    it("replaces all __PLACEHOLDER__ markers", done => {
        const result = buildUserData(testConfig);
        result.apply(script => {
            const remaining = script.match(/__[A-Z_]+__/g);
            assert.strictEqual(
                remaining,
                null,
                `Unreplaced placeholders: ${remaining}`,
            );
            done();
        });
    });

    it("injects userName into script", done => {
        buildUserData(testConfig).apply(script => {
            assert.ok(
                script.includes("testuser"),
                "script should contain userName",
            );
            done();
        });
    });

    it("injects gitName into script", done => {
        buildUserData(testConfig).apply(script => {
            assert.ok(
                script.includes("Test User"),
                "script should contain gitName",
            );
            done();
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --grep "buildUserData"
```

Expected: FAIL — `Cannot find module '../userData'`

- [ ] **Step 3: Write userData.ts**

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from "path";
import { WorkstationConfig } from "./config";

export function buildUserData(cfg: WorkstationConfig): pulumi.Output<string> {
    const template = fs.readFileSync(
        path.join(__dirname, "scripts", "cloud-init.sh"),
        "utf8",
    );

    return cfg.sshPublicKey.apply(pubKey =>
        template
            .replace(/__USER_NAME__/g, cfg.userName)
            .replace(/__GIT_NAME__/g, cfg.gitName)
            .replace(/__GIT_EMAIL__/g, cfg.gitEmail)
            .replace(/__SSH_PUBLIC_KEY__/g, pubKey)
            .replace(/__GITHUB_SECRET_NAME__/g, cfg.githubSecretName)
            .replace(/__DOTFILES_REPO__/g, cfg.dotfilesRepo)
            .replace(/__AWS_REGION__/g, cfg.awsRegion),
    );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --grep "buildUserData"
```

Expected: 4 passing.

- [ ] **Step 5: Compile check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add userData.ts tests/userData.test.ts
git commit -m "feat: add userData module with placeholder templating"
```

---

## Task 7: Compute Module

**Files:**
- Create: `compute.ts`
- Create: `tests/compute.test.ts`

**Interfaces:**
- Consumes: `WorkstationConfig`, `aws.ec2.SecurityGroup`, `aws.iam.InstanceProfile`, `pulumi.Output<string>` (userData)
- Produces: `createCompute(cfg, sg, profile, userData): { instance, eip, eipAssoc }`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/compute.test.ts
import * as assert from "assert";
import * as pulumi from "@pulumi/pulumi";

pulumi.runtime.setMocks(
    {
        newResource: (args: pulumi.runtime.MockResourceArgs) => ({
            id: `${args.name}_id`,
            state: args.inputs,
        }),
        call: (args: pulumi.runtime.MockCallArgs) => ({
            ...args.inputs,
            // Simulate AMI lookup returning a fake ID
            id: "ami-0fake1234567890ab",
        }),
    },
    "dev",
    true,
);

import * as aws from "@pulumi/aws";
import { createCompute } from "../compute";
import { WorkstationConfig } from "../config";

const testConfig: WorkstationConfig = {
    instanceType: "t3.large",
    ebsSizeGb: 100,
    userName: "matty",
    gitName: "Matt Stratton",
    gitEmail: "matty@tigerdata.com",
    sshPublicKey: pulumi.output("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 test"),
    githubSecretName: "workstation/github-ssh-key",
    dotfilesRepo: "https://github.com/mattstratton/matty-dotfiles",
    awsRegion: "us-east-1",
};

describe("createCompute", () => {
    let sg: aws.ec2.SecurityGroup;
    let profile: aws.iam.InstanceProfile;
    let resources: ReturnType<typeof createCompute>;

    before(() => {
        sg = new aws.ec2.SecurityGroup("test-sg", {
            ingress: [],
            egress: [],
        });
        profile = new aws.iam.InstanceProfile("test-profile", {});
        resources = createCompute(
            testConfig,
            sg,
            profile,
            pulumi.output("#!/bin/bash\necho hello"),
        );
    });

    it("creates an EC2 instance", () => {
        assert.ok(resources.instance instanceof pulumi.CustomResource);
    });

    it("creates an Elastic IP", () => {
        assert.ok(resources.eip instanceof pulumi.CustomResource);
    });

    it("uses configurable instance type", done => {
        resources.instance.instanceType.apply(itype => {
            assert.strictEqual(itype, "t3.large");
            done();
        });
    });

    it("sets root volume to configurable size", done => {
        resources.instance.rootBlockDevice.apply(rbd => {
            assert.strictEqual((rbd as any).volumeSize, 100);
            assert.strictEqual((rbd as any).volumeType, "gp3");
            done();
        });
    });

    it("tags instance with Name=ai-workstation", done => {
        resources.instance.tags.apply(tags => {
            assert.strictEqual((tags as any)["Name"], "ai-workstation");
            done();
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --grep "createCompute"
```

Expected: FAIL — `Cannot find module '../compute'`

- [ ] **Step 3: Write compute.ts**

```typescript
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { WorkstationConfig } from "./config";

export interface ComputeResources {
    instance: aws.ec2.Instance;
    eip: aws.ec2.Eip;
    eipAssoc: aws.ec2.EipAssociation;
}

export function createCompute(
    cfg: WorkstationConfig,
    sg: aws.ec2.SecurityGroup,
    profile: aws.iam.InstanceProfile,
    userData: pulumi.Output<string>,
): ComputeResources {
    const ami = aws.ec2.getAmi({
        mostRecent: true,
        owners: ["099720109477"], // Canonical
        filters: [
            {
                name: "name",
                values: [
                    "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*",
                ],
            },
            { name: "architecture", values: ["x86_64"] },
            { name: "virtualization-type", values: ["hvm"] },
        ],
    });

    const instance = new aws.ec2.Instance("workstation", {
        ami: ami.then(a => a.id),
        instanceType: cfg.instanceType as aws.ec2.InstanceType,
        vpcSecurityGroupIds: [sg.id],
        iamInstanceProfile: profile.name,
        userData: userData,
        userDataReplaceOnChange: false,
        rootBlockDevice: {
            volumeType: "gp3",
            volumeSize: cfg.ebsSizeGb,
            deleteOnTermination: true,
        },
        tags: {
            Name: "ai-workstation",
            ManagedBy: "pulumi",
        },
    });

    const eip = new aws.ec2.Eip("workstation-eip", {
        domain: "vpc",
        tags: { Name: "ai-workstation-eip" },
    });

    const eipAssoc = new aws.ec2.EipAssociation("workstation-eip-assoc", {
        instanceId: instance.id,
        allocationId: eip.allocationId,
    });

    return { instance, eip, eipAssoc };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --grep "createCompute"
```

Expected: 5 passing.

- [ ] **Step 5: Compile check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add compute.ts tests/compute.test.ts
git commit -m "feat: add compute module (AMI lookup, EC2, Elastic IP)"
```

---

## Task 8: Entry Point and Stack Outputs

**Files:**
- Create: `index.ts`

**Interfaces:**
- Consumes: all modules (config, networking, iam, userData, compute)
- Produces: exported Pulumi stack outputs: `publicIp`, `instanceId`, `sshCommand`, `moshCommand`

- [ ] **Step 1: Write index.ts**

```typescript
import * as pulumi from "@pulumi/pulumi";
import { loadConfig } from "./config";
import { createSecurityGroup } from "./networking";
import { createInstanceProfile } from "./iam";
import { buildUserData } from "./userData";
import { createCompute } from "./compute";

const cfg = loadConfig();
const sg = createSecurityGroup();
const profile = createInstanceProfile(cfg.githubSecretName);
const userData = buildUserData(cfg);
const { instance, eip } = createCompute(cfg, sg, profile, userData);

export const publicIp = eip.publicIp;
export const instanceId = instance.id;
export const sshCommand = pulumi.interpolate`ssh ${cfg.userName}@${eip.publicIp}`;
export const moshCommand = pulumi.interpolate`mosh ${cfg.userName}@${eip.publicIp}`;
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: all tests passing (networking: 3, iam: 2, userData: 4, compute: 5 = 14 total).

- [ ] **Step 3: Compile check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add index.ts
git commit -m "feat: wire entry point with stack outputs"
```

---

## Task 9: Stack Config, README, and Pre-Provision Docs

**Files:**
- Create: `Pulumi.dev.yaml`
- Create: `README.md`

**Interfaces:**
- Produces: runnable stack; human-readable setup guide

- [ ] **Step 1: Write Pulumi.dev.yaml**

```yaml
config:
  aws:region: us-east-1
  mattstratton-ai-workstation:instance-type: t3.large
  mattstratton-ai-workstation:ebs-size-gb: "100"
  mattstratton-ai-workstation:user-name: matty
  mattstratton-ai-workstation:git-name: Matt Stratton
  mattstratton-ai-workstation:git-email: matty@tigerdata.com
  mattstratton-ai-workstation:github-secret-name: workstation/github-ssh-key
  mattstratton-ai-workstation:dotfiles-repo: https://github.com/mattstratton/matty-dotfiles
```

Note: `ssh-public-key` is intentionally absent — it must be set as a secret:
```bash
pulumi config set --secret mattstratton-ai-workstation:ssh-public-key "$(cat ~/.ssh/your_key.pub)"
```

- [ ] **Step 2: Write README.md**

```markdown
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
```

- [ ] **Step 3: Run full test suite one final time**

```bash
npm test
```

Expected: all 14 tests passing, 0 failing.

- [ ] **Step 4: Final compile check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add Pulumi.dev.yaml README.md
git commit -m "chore: add stack config defaults and setup README"
```

---

## Verification (end-to-end)

After all tasks complete:

1. **Local tests pass:** `npm test` → 14 passing
2. **TypeScript clean:** `npx tsc --noEmit` → exits 0
3. **Preview succeeds** (requires AWS credentials + Pulumi stack initialized):
   ```bash
   pulumi stack init dev
   pulumi config set --secret mattstratton-ai-workstation:ssh-public-key "$(cat ~/.ssh/id_ed25519.pub)"
   pulumi preview --stack dev
   ```
   Expected: shows planned resources (SecurityGroup, Role, RolePolicy, InstanceProfile, Instance, Eip, EipAssociation) with no errors.
4. **Deploy:** `pulumi up --stack dev` → EC2 instance running, Elastic IP attached
5. **SSH:** `$(pulumi stack output sshCommand)` → connects as `matty`
6. **mosh:** `$(pulumi stack output moshCommand)` → mosh session opens
7. **Cloud-init complete:** `sudo tail -50 /var/log/cloud-init-custom.log` → shows "Bootstrap complete"
8. **Tools installed:** `claude --version`, `me --version`, `tiger --version`, `herdr --version`
9. **Docker:** `docker run --rm hello-world` → success
10. **GitHub SSH:** `ssh -T git@github.com` → "Hi mattstratton!"
11. **Repos:** `ls ~/src/github.com/timescale/` → tiger-den, marketing-skills, rta-bench-private
