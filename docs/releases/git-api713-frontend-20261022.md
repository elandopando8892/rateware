# Conciliación de fuentes publicadas · API713 y Bidware

22/oct/2026. Este cambio registra las fuentes que ya estaban publicadas. No introduce una nueva publicación, migración ejecutada, mensaje, oferta ni adjudicación. La autorización del usuario limita esta operación a conciliar Git con producción.

## Referencia y criterio

Se reutiliza el procedimiento de conciliación API711: construir desde el main remoto con un índice Git separado, comparar las fuentes activas, generar commits fast-forward y conservar el checkout compartido. Actualizar el checkout antiguo mezclaría trabajo ajeno; guardar únicamente un ZIP no dejaría main reproducible. Se adopta el primer método, sin nuevas dependencias, infraestructura ni inferencias externas. Codex nativo ejecuta y verifica; el método documentation organiza la trazabilidad.

## Qué contiene

- Rateware API713: las 33 fuentes ejecutables coinciden byte por byte con el runtime. Se conserva la declaración de tipos Reefer; el frontend Rateware y las demás funciones desplegadas quedan fuera de esta conciliación.
- Bidware: 218 fuentes/configuraciones del frontend activo, incluyendo las publicaciones anteriores de Carrier Fit, audiencia revisada PRIMA y asociación de respuestas WhatsApp. Los 39 cambios sustantivos frente al main anterior se incorporan. Se preservan 144 archivos que sólo diferían por CRLF/LF; no se incorpora tsconfig.tsbuildinfo.
- La migración ya aplicada se registra como `20261022212138_whatsapp_reply_association.sql`, que coincide con el ledger productivo. Su contenido es idéntico al archivo autorizado `20261022020000_whatsapp_reply_association.sql`; no deben aplicarse ambos nombres. Esta conciliación no vuelve a ejecutar SQL.
- Los package.json y package-lock.json raíz permanecen idénticos a los padres Git. El paquete interno de lectura HTTP ya usado por el frontend publicado se incorpora sin instalar dependencias.

## Evidencia

El manifiesto adjunto `git-api713-frontend-20261022.json` enumera hashes publicados, hashes Git y hashes con LF canónico. La compilación local desde el árbol preparado reproduce exactamente los cuatro archivos de producción de `dpl_2z3LQLfuZL3vzzk7ofkjNPDrZj3s`. TypeScript pasa. Se conserva el aviso anterior de chunks superiores a 500 kB.

La API activa es713, bundle `c3abd54999a6a59002c5cb231b2c39f63acff87a85d912f706fa5c6e947ac6f2`. Los ensayos S23 de14 grupos PostgreSQL y6 recorridos de navegador corresponden a la publicación anterior del mismo código; no se presentan como una nueva ejecución. Esta operación comprueba paridad de fuentes y compilación, no repite decisiones comerciales ni la asociación del piloto.

## Publicación Git y recuperación

Antes del push se exige main remoto igual al padre registrado, Supabase Deploy to production apagado y Vercel sin publicar este push. Bidware usa una pausa temporal del paso de compilación; se restaura su valor previo al confirmar la cancelación. Rateware conserva su exclusión de producción vigente. No se cambia GitHub ni se activa branching.

La evidencia local de esta operación queda en Bidware `.artifacts/s23-git-conciliacion-20261022/`: árboles, commits, manifiestos, patch, bundle, reversión ensayada sobre índice aislado y comprobaciones posteriores. No se incluyen credenciales, conversaciones, recibos privados ni datos comerciales en el commit. Los checkpoints permiten recuperar los commits; cualquier reversión remota posterior debe ser otro commit, nunca force-push ni reescritura de historia.

Los HEAD e índices ordinarios siguen intactos. Los cambios concurrentes de otros trabajos permanecen en sus archivos locales y no se incorporan por proximidad. No se certifica que todo Rateware sea desplegable desde un checkout antiguo: esta referencia cubre API713 y el frontend Bidware identificado.
