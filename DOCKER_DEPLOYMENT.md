# Despliegue con Docker en DigitalOcean

## 📋 Requisitos

- Droplet DigitalOcean con Docker instalado
- Git
- Variables de entorno (API keys de Binance)

## 🚀 Despliegue Rápido (1-5 minutos)

### 1. Conectar al Droplet

```bash
ssh root@TU_DROPLET_IP
```

### 2. Clonar el Repositorio

```bash
git clone https://github.com/TU_USUARIO/spot-bot.git
cd spot-bot
```

### 3. Crear archivo .env

```bash
cat > .env << 'EOF'
NODE_ENV=production
API_PORT=4444
BINANCE_API_KEY=tu_api_key_aqui
BINANCE_API_SECRET=tu_api_secret_aqui
EOF
```

### 4. Iniciar con Docker Compose

```bash
# Construir y ejecutar
docker-compose up -d

# Ver logs en tiempo real
docker-compose logs -f spot-bot

# Ver estado
docker-compose ps
```

### 5. Acceder a la App

```
http://TU_DROPLET_IP:4444
```

---

## 🛠️ Comandos Útiles

```bash
# Ver logs en tiempo real
docker-compose logs -f spot-bot

# Ver últimas 50 líneas de logs
docker-compose logs --tail=50 spot-bot

# Detener la app
docker-compose stop

# Reiniciar la app
docker-compose restart

# Eliminar (con datos)
docker-compose down

# Ver estado del contenedor
docker-compose ps

# Ejecutar comando dentro del contenedor
docker-compose exec spot-bot npm status
```

---

## 🔄 Actualizar desde GitHub

```bash
# Detener la app
docker-compose stop

# Obtener cambios nuevos
git pull origin main

# Reconstruir imagen y reiniciar
docker-compose up -d --build

# Ver logs
docker-compose logs -f spot-bot
```

---

## 📊 Monitoreo

### Ver consumo de recursos

```bash
docker stats spot-bot
```

### Ver el contenedor

```bash
docker ps | grep spot-bot
```

### Acceder a la terminal del contenedor

```bash
docker-compose exec spot-bot sh
```

---

## 🔧 Configuración Avanzada (Nginx Proxy)

### Crear archivo /etc/nginx/sites-available/spot-bot

```nginx
server {
    listen 80;
    server_name TU_DOMINIO_O_IP;

    location / {
        proxy_pass http://localhost:4444;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Habilitar Nginx

```bash
ln -s /etc/nginx/sites-available/spot-bot /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
```

---

## 🐛 Solución de Problemas

### La app no inicia

```bash
docker-compose logs spot-bot
```

Busca el error específico en los logs.

### Puerto 4444 ya está en uso

```bash
# Cambiar el puerto en docker-compose.yml
# Modificar: ports: ["5555:4444"]
docker-compose down
docker-compose up -d
```

### Contenedor se reinicia constantemente

```bash
# Ver logs detallados
docker logs --follow spot-bot
```

### Limpiar todo y empezar de nuevo

```bash
docker-compose down -v  # -v elimina volúmenes también
docker system prune -a
docker-compose up -d --build
```

---

## 📝 Variables de Entorno Disponibles

```bash
NODE_ENV=production          # Ambiente (production/development)
API_PORT=4444              # Puerto de escucha
BINANCE_API_KEY=...        # API key de Binance
BINANCE_API_SECRET=...     # API secret de Binance
```

---

## ✅ Checklist de Despliegue

- [ ] Droplet creado en DigitalOcean
- [ ] Docker instalado en Droplet
- [ ] Repositorio clonado
- [ ] Archivo .env creado con credenciales Binance
- [ ] `docker-compose up -d` ejecutado sin errores
- [ ] App accesible en `http://IP:4444`
- [ ] Logs se ven correctamente
- [ ] (Opcional) Nginx configurado como proxy

---

## 🔐 Seguridad

- ✅ Nunca commits del archivo `.env` a GitHub
- ✅ Las variables se inyectan en tiempo de ejecución
- ✅ El contenedor corre sin privilegios de root
- ✅ Usa HTTPS en producción (SSL con Nginx)

---

## 📞 Soporte

Si hay errores, revisa:
1. `docker-compose logs spot-bot`
2. `docker ps` para verificar que el contenedor está corriendo
3. Que el archivo `.env` tenga las credenciales correctas
4. Que el puerto 4444 esté disponible (no bloqueado por firewall)
