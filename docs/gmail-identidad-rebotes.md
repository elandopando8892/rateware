# Gmail: identidad y última sincronización de rebotes

`list_gmail_connections` devuelve `sender_name` (metadata, después GMAIL_SENDER_NAME, después null) y `bounces_synced_at`. No devuelve metadata completa ni tokens. Es información de configuración; este cambio no altera el MIME ni la política de envío.

`sync_gmail_bounces` actualiza metadata.bounces_synced_at al completar la ejecución, aun con cero resultados, y devuelve la misma fecha. El límite de mensajes y la ventana de 45 días existentes se conservan: la fecha no acredita haber procesado toda la historia del buzón. Fallos de Gmail o de persistencia devuelven error y no avanzan la fecha. Un fallo al leer el detalle de un mensaje ahora detiene el proceso en lugar de ocultar una sincronización incompleta.

La escritura está limitada por owner_email, mailbox_email, id y estado conectado; relee metadata y compara updated_at antes de mezclar la fecha. Reintenta hasta tres veces ante cambios concurrentes para no sobrescribir metadata de un refresh OAuth u otra tarea. Las operaciones previas de supresión/auditoría mantienen su comportamiento transaccional existente: un error tardío puede requerir reintento, sin afirmar atomicidad global.

Verificación: ocho pruebas Deno del handler con Supabase/Gmail ficticios y sin permiso de red. Cubren proyección, prioridad/fallback/null del remitente, cero/un rebote, relectura persistida, errores de listado/detalle/escritura y conflictos concurrentes. No se usaron secretos reales ni se sincronizó un buzón productivo.

Desplegar backend antes del cliente Bidware; no requiere migración. PR del cliente apilado sobre Bidware #52 para conservar ES/EN.
