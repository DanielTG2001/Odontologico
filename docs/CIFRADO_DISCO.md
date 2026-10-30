# Cifrado en reposo de la base de datos (RNF-04)

El código ya cifra los archivos en S3 (SSE AES-256) y los respaldos (`BACKUP_ENCRYPTION_KEY`). Falta que el
**disco donde vive PostgreSQL** esté cifrado. Es una tarea del servidor: hay que hacerla donde esté alojado
el sistema. Elige la opción según tu hosting.

## Opción A – Base de datos administrada (lo más simple)

| Proveedor | Cifrado en reposo |
|-----------|-------------------|
| AWS RDS / Aurora | Activar **Encryption** (AES-256, KMS) **al crear** la instancia; no se activa después |
| Azure Database for PostgreSQL | Activado por defecto |
| Google Cloud SQL | Activado por defecto |
| DigitalOcean Managed Databases | Activado por defecto |

Cambia `DATABASE_URL` a la base administrada y quita el servicio `postgres` de `docker-compose.prod.yml`.

## Opción B – Volumen en la nube para un VPS

- **AWS EC2:** volumen EBS con *Encrypted* activado (o "cifrado por defecto" en la región).
- **DigitalOcean / Hetzner / Linode:** los volúmenes de bloque se cifran en el proveedor; para controlar
  la clave tú mismo usa la opción C sobre ese volumen.

## Opción C – Servidor propio o VPS: LUKS (AES-256-XTS)

> ⚠️ `luksFormat` **borra** el disco. Hazlo sobre un disco nuevo y antes de cargar datos,
> o restaura un respaldo después.

```bash
# 1. Identificar el disco de datos (ej. /dev/sdb). ¡Verificar dos veces!
lsblk

# 2. Cifrar y abrir
sudo cryptsetup luksFormat --type luks2 --cipher aes-xts-plain64 --key-size 512 /dev/sdb
sudo cryptsetup open /dev/sdb sigo_data
sudo mkfs.ext4 /dev/mapper/sigo_data
sudo mkdir -p /srv/sigo-data
sudo mount /dev/mapper/sigo_data /srv/sigo-data

# 3. Guardar la clave de recuperación FUERA del servidor (gestor de contraseñas de la clínica)
sudo cryptsetup luksHeaderBackup /dev/sdb --header-backup-file sigo-luks-header.img
```

Usar ese disco para PostgreSQL, Redis y MinIO en `docker-compose.prod.yml`:

```yaml
volumes:
  pg_data:
    driver: local
    driver_opts: { type: none, o: bind, device: /srv/sigo-data/postgres }
  redis_data:
    driver: local
    driver_opts: { type: none, o: bind, device: /srv/sigo-data/redis }
  minio_data:
    driver: local
    driver_opts: { type: none, o: bind, device: /srv/sigo-data/minio }
```

```bash
sudo mkdir -p /srv/sigo-data/{postgres,redis,minio}
```

**Arranque tras un reinicio:** el disco queda cerrado hasta que alguien lo abra
(`cryptsetup open` + `mount`) o se configure el desbloqueo con TPM/clave en `/etc/crypttab`.
Inclúyelo en el procedimiento de reinicio para no afectar la disponibilidad (RNF-02).

## Verificación

```bash
./deploy/check-encryption.sh
```

Resultado esperado: `✅ El volumen de PostgreSQL está sobre un dispositivo cifrado (crypt)`.
Guarda la salida como evidencia para el acta de aceptación.
