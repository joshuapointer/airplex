# airplex Ansible role

Standalone Ansible role that deploys [airplex](https://github.com/OWNER/airplex) on any
Debian/Ubuntu/Arch Linux host that already has Docker Engine installed.

## Requirements

| Requirement                 | Minimum version |
| --------------------------- | --------------- |
| Ansible                     | 2.14            |
| community.docker collection | 3.x             |
| Docker Engine on target     | 24.x            |

Install the collection:

```bash
ansible-galaxy collection install -r ansible/requirements.yml
```

## Quickstart

1. Copy the example inventory and point it at your host:

   ```bash
   cp ansible/inventory.example.ini ansible/inventory.ini
   # edit ansible/inventory.ini — replace airplex.example.com
   ```

2. Create a vars file with your secrets (or use SOPS — see below):

   ```bash
   cat > host_vars/my-host.yml <<'EOF'
   airplex_app_url: "https://airplex.example.com"
   airplex_plex_base_url: "http://plex.lan:32400"
   airplex_plex_token: "CHANGEME"
   airplex_plex_client_identifier: "airplex"
   airplex_session_secret: "64-hex-chars"        # npx tsx scripts/gen-secrets.ts
   airplex_device_lock_secret: "64-hex-chars"
   airplex_share_token_secret: "64-hex-chars"
   airplex_oidc_issuer_url: "https://auth.example.com/application/o/airplex/"
   airplex_oidc_client_id: "airplex"
   airplex_oidc_client_secret: "CHANGEME"
   airplex_domain: "airplex.example.com"
   EOF
   ```

3. Run the playbook:

   ```bash
   ansible-playbook ansible/site.yml -i ansible/inventory.ini --ask-become-pass
   ```

## Variables

All variables live in `roles/airplex/defaults/main.yml`. Key ones:

| Variable                 | Default                        | Description                                    |
| ------------------------ | ------------------------------ | ---------------------------------------------- |
| `airplex_image`          | `ghcr.io/OWNER/airplex:latest` | Container image to deploy                      |
| `airplex_install_dir`    | `/opt/airplex`                 | Where compose files and .env land              |
| `airplex_data_dir`       | `/opt/airplex/data`            | SQLite data volume; must be local FS           |
| `airplex_env_source`     | `vars`                         | `vars` (template) or `sops` (pre-materialized) |
| `airplex_env_file`       | `/run/secrets/airplex.env`     | Path when `env_source=sops`                    |
| `airplex_docker_network` | `airplex_default`              | Set to `jarch-public` on jarch hosts           |
| `airplex_public_port`    | `3000`                         | Host port to expose                            |
| `airplex_domain`         | `airplex.example.com`          | Used in Traefik labels (jarch mode)            |

## SOPS mode (jarch hosts)

When the secrets role has already materialised `/run/secrets/airplex.env`:

```yaml
airplex_env_source: 'sops'
airplex_env_file: '/run/secrets/airplex.env'
airplex_docker_network: 'jarch-public'
```

The role will assert the file exists and skip templating.

## NFS guard

The preflight task refuses to proceed if `airplex_data_dir`'s parent filesystem is
`nfs` or `nfs4`. SQLite advisory locks are unreliable over NFS and will corrupt the
database under concurrent writes. Use a local disk.

## Syntax check

```bash
ansible-playbook ansible/site.yml --syntax-check -i ansible/inventory.example.ini
```
