#!/bin/bash
# Run this script on a fresh Ubuntu 24.04 EC2 instance (t3.medium).
# Usage: bash bootstrap-ec2.sh

set -e

# 1. Install Docker
apt-get update -y
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Allow current user to run docker without sudo
usermod -aG docker $USER

# 2. Clone repo
git clone https://github.com/mub05-dev/ciclovias-cl.git /opt/ciclovias-cl
cd /opt/ciclovias-cl

# 3. Create .env.prod (fill in values before running deploy)
cp .env.prod.example .env.prod
echo ""
echo "============================================"
echo "Edit /opt/ciclovias-cl/.env.prod with real values, then run:"
echo "  cd /opt/ciclovias-cl"
echo "  docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build"
echo "============================================"
