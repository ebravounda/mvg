# MVG Computación - Sistema de Gestión de Órdenes de Servicio

## Visión general
PWA / app móvil Expo para que **MVG Computación** (empresa TI) gestione órdenes de servicio (tickets) asignadas a técnicos en terreno. Los técnicos finalizan cada orden adjuntando evidencia fotográfica desde la cámara o galería del dispositivo.

## Roles
- **Administrador**: gestiona clientes, sucursales (de sus clientes), técnicos y crea/asigna órdenes de trabajo. Visualiza KPIs y evidencia.
- **Técnico**: ve sólo sus órdenes asignadas, las inicia, y las finaliza adjuntando foto + notas.

## Funcionalidades implementadas (MVP)
### Backend (FastAPI + MongoDB + JWT)
- Login JWT (`/api/auth/login`) + `/api/auth/me`
- CRUD Técnicos con campos: rut, nombre, apellidos, email, teléfono, password
- CRUD Clientes (con cascada de sucursales al eliminar)
- CRUD Sucursales asociadas a clientes
- CRUD Órdenes (numero auto-correlativo OS-YYYY-XXXX) con cliente/sucursal/técnico/título/descripción/prioridad/estado/evidencia/notas
- KPI stats endpoint para dashboard admin
- Endpoints técnico: listar mis órdenes, iniciar, finalizar con evidencia obligatoria
- Seed automático de admin (admin@mvg.cl / Admin123!)
- Index único sobre email
- Role guards (require_admin, require_tecnico, scope técnico→sus órdenes)

### Frontend (Expo Router + React Native)
- Login con logo MVG y branding dark + azul/naranja
- **Admin** (4 tabs):
  - Inicio: KPIs (En proceso, Pendientes, Completadas, Total) + quick stats + últimas órdenes
  - Órdenes: lista con filtros chips (Todas/Pendientes/En progreso/Finalizadas), creación con bottom sheet, detalle con cliente+sucursal+técnico+evidencia
  - Clientes: lista, creación, detalle con gestión de sucursales (CRUD)
  - Técnicos: lista con avatares, creación con todos los campos requeridos, eliminación
- **Técnico** (2 tabs):
  - Mis órdenes: lista filtrable con CTA contextual ("Iniciar trabajo" / "Finalizar trabajo")
  - Perfil: info personal + cerrar sesión
- Detalle de orden técnico con flujo:
  1. Iniciar (pendiente → en_progreso)
  2. Finalizar: bottom sheet con picker de foto (cámara o galería) + notas opcionales → en_progreso → finalizada
- Manejo de permisos contextual (cámara/galería) con redirección a ajustes si denegado
- Toast notifications, Bottom sheets nativos, Sticky header con logo
- Test IDs en todos los elementos interactivos

## Tecnologías
- Backend: FastAPI, Motor (MongoDB async), Passlib + bcrypt, python-jose (JWT)
- Frontend: Expo SDK 54, Expo Router, axios, expo-image-picker, expo-camera, react-native-safe-area-context
- Storage: AsyncStorage + SecureStore (vía `@/src/utils/storage`)

## Credenciales seed
- Admin: `admin@mvg.cl` / `Admin123!`

## Próximos pasos sugeridos
- Notificaciones push (solo bajo solicitud explícita del usuario)
- Exportar PDF de orden con evidencia
- Reportes y métricas históricas
- Asignación múltiple de técnicos por orden
