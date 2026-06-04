# SPOT-BOT Deployment Guide - DigitalOcean

Este guía explica cómo desplegar SPOT-BOT en DigitalOcean App Platform.

## Prerequisitos

1. Una cuenta en [DigitalOcean](https://www.digitalocean.com/)
2. Un repositorio en GitHub (público o privado)
3. CLI de DigitalOcean (`doctl`) instalado localmente
4. Las claves de API de Binance

## Pasos de Despliegue

### 1. Preparar el Repositorio GitHub

```bash
# Asegurase de que el código está en GitHub
git remote add origin https://github.com/your-username/spot-bot.git
git push -u origin main
```

### 2. Crear una Aplicación en DigitalOcean

#### Opción A: A través del Dashboard de DigitalOcean

1. Ir a [DigitalOcean Dashboard](https://cloud.digitalocean.com)
2. Hacer clic en "Apps" en el menú lateral
3. Hacer clic en "Create App" o "Launch App"
4. Conectar tu cuenta de GitHub
5. Seleccionar el repositorio `spot-bot`
6. Seleccionar la rama `main`
7. Dejar que DigitalOcean detecte automáticamente la configuración
8. Si no detecta, seleccionar "Docker" como tipo de build
9. Configurar las variables de entorno:
   - `NODE_ENV=production`
   - `API_PORT=4445`
   - `BINANCE_API_KEY=your_api_key`
   - `BINANCE_API_SECRET=your_api_secret`

#### Opción B: A través de la CLI (`doctl`)

```bash
# Autenticarse con DigitalOcean
doctl auth init

# Crear la aplicación usando el archivo app.yaml
doctl apps create --spec app.yaml
```

### 3. Configurar Variables de Entorno

En el Dashboard de DigitalOcean:

1. Ir a tu aplicación
2. Hacer clic en "Settings"
3. Ir a "Environment"
4. Agregar las siguientes variables:

```
API_PORT=4445
NODE_ENV=production
BINANCE_API_KEY=your_api_key_here
BINANCE_API_SECRET=your_api_secret_here
```

**IMPORTANTE:** Las claves de Binance deben ser de tipo "Read-only" para máxima seguridad.

### 4. Configurar el Container Registry (Opcional)

Para usar el DigitalOcean Container Registry:

```bash
# Crear un Container Registry
doctl registry create spot-bot-registry

# Ver credenciales
doctl registry get-docker-config > ${HOME}/.docker/config.json

# Hacer login
docker login registry.digitalocean.com
```

### 5. GitHub Actions CI/CD (Automático)

El archivo `.github/workflows/deploy.yml` automatiza el despliegue:

1. Cualquier push a `main` construye y despliega automáticamente
2. Se requieren los siguientes secrets en GitHub:
   - `DIGITALOCEAN_ACCESS_TOKEN`: Tu token de DigitalOcean
   - `REGISTRY_NAME`: Nombre de tu registry
   - `APP_ID`: ID de tu aplicación en DigitalOcean

Para configurar los secrets:

1. Ir a tu repositorio en GitHub
2. Settings → Secrets and variables → Actions
3. Crear un nuevo secret:
   - Nombre: `DIGITALOCEAN_ACCESS_TOKEN`
   - Valor: Tu token de DigitalOcean

Obtener el token:
1. Ir a DigitalOcean Dashboard
2. API → Tokens/Keys
3. Generate New Token (personal access token)

### 6. Obtener la URL de la Aplicación

Una vez desplegada, DigitalOcean proporciona una URL pública:

```
https://spot-bot-xxxxx.ondigitalocean.app
```

## Verificar el Despliegue

```bash
# Ver el estado de la aplicación
doctl apps get <app-id> --format status

# Ver los logs
doctl apps logs <app-id>

# Hacer un test de la API
curl https://spot-bot-xxxxx.ondigitalocean.app/api/health
```

## Monitoreo y Mantenimiento

### Logs

```bash
# Ver logs en tiempo real
doctl apps logs <app-id> --follow

# Ver últimos 100 logs
doctl apps logs <app-id> --tail 100
```

### Escalamiento

Para aumentar recursos:

1. En el Dashboard, ir a Resources
2. Ajustar CPU/Memoria según sea necesario
3. Los cambios se aplican sin downtime

### Actualizaciones

Para actualizar a una nueva versión:

```bash
# Hacer push a main (automáticamente se deploya)
git add .
git commit -m "Update to v1.4.0"
git push origin main

# O manualmente triggear un deployment
doctl apps create-deployment <app-id>
```

## Troubleshooting

### Error: "Health check failed"

- Verificar que la API está respondiendo en `/api/health`
- Revisar los logs: `doctl apps logs <app-id>`
- Asegurar que el puerto 4445 está correctamente configurado

### Error: "Container failed to start"

- Revisar los logs de construcción
- Verificar que todas las dependencias están en package.json
- Asegurar que el Dockerfile copia los archivos correctamente

### La API no responde

1. Verificar que la aplicación está en estado "Running"
2. Revisar los logs para errores
3. Verificar la conectividad a Binance API
4. Confirmar que las claves API son válidas

## Costos Estimados

- **Compute**: $5-12/mes (Basic/Standard)
- **Bandwidth**: Incluido (25GB/mes)
- **Total estimado**: $5-12/mes

## Backup y Recuperación

DigitalOcean Apps no tiene almacenamiento persistente automático. Si necesitas datos persistentes:

1. Usar DigitalOcean Spaces (S3-compatible)
2. Usar DigitalOcean Database
3. Configurar una base de datos externa

Para SPOT-BOT (sin estado persistente), no es necesario.

## Seguridad

- Usar solo HTTPS (DigitalOcean lo maneja automáticamente)
- Mantener las claves API en variables de entorno (nunca en código)
- Rotacionar las claves API periódicamente
- Usar claves API de "Read-only" en Binance

## Soporte

- [DigitalOcean Documentation](https://docs.digitalocean.com/)
- [DigitalOcean Community](https://www.digitalocean.com/community/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
