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
export HOME=/root

# --- 1. System update ---
apt-get update -y
apt-get upgrade -y -o Dpkg::Options::="--force-confold"

# --- 2. Core packages ---
apt-get install -y \
    git git-extras tmux mosh zsh vim neovim wget curl entr jq tree gnupg \
    ripgrep fd-find htop autojump direnv unzip \
    golang-go \
    pipx \
    build-essential \
    yadm

# --- 2a. Docker (official repo for docker-compose-plugin) ---
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# --- 2b. AWS CLI v2 ---
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp/
/tmp/aws/install
rm -rf /tmp/aws /tmp/awscliv2.zip

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
mkdir -p /tmp/tiger-install
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
chown -R "${USERNAME}:${USERNAME}" "${USER_HOME}/.ssh"

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
# thefuck skipped — incompatible with Python 3.12 (removed imp and distutils modules)

# --- 16. Clone Timescale repos ---
sudo -u "${USERNAME}" mkdir -p "${USER_HOME}/src/github.com/timescale"
sudo -u "${USERNAME}" git clone git@github.com:timescale/tiger-den.git \
    "${USER_HOME}/src/github.com/timescale/tiger-den" || echo "WARNING: tiger-den clone failed, skipping"
sudo -u "${USERNAME}" git clone git@github.com:timescale/marketing-skills.git \
    "${USER_HOME}/src/github.com/timescale/marketing-skills" || echo "WARNING: marketing-skills clone failed, skipping"
sudo -u "${USERNAME}" git clone git@github.com:timescale/rta-bench-private.git \
    "${USER_HOME}/src/github.com/timescale/rta-bench-private" || echo "WARNING: rta-bench-private clone failed, skipping"

# --- 17. zshrc (write baseline first so yadm clone can override) ---
cat > "${USER_HOME}/.zshrc" << 'ZSHRC'
export PATH="$HOME/.atuin/bin:$HOME/.local/bin:$HOME/.local/pipx/bin:$HOME/go/bin:/usr/local/bin:$PATH"
source /usr/share/zsh-plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
eval "$(starship init zsh)"
eval "$(atuin init zsh)"
[[ -s /usr/share/autojump/autojump.sh ]] && source /usr/share/autojump/autojump.sh
eval "$(direnv hook zsh)"
# zsh-syntax-highlighting must be last
source /usr/share/zsh-plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
ZSHRC
chown "${USERNAME}:${USERNAME}" "${USER_HOME}/.zshrc"

# --- 18. Dotfiles (skipped — add .zshrc##os.Linux to dotfiles repo first) ---
# sudo -u "${USERNAME}" yadm clone "${DOTFILES_REPO}"

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
