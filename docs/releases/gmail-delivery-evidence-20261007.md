# Paquete local de evidencia de entrega Gmail

7/oct/2026. Sin publicar. Base main d9ea359342a6cb8c61f16c63b8cebfdc7cf16eff, runtime 686 verificado sin deriva. Cambios acotados: preservar HTTP/motivos permitidos en resultados e historial de rechazos Gmail; recuperar último fallo mediante consulta por owner/mensaje/evento, proveedor y source, con timeout de dos segundos y fallback sin bloquear el contenido.

Dos archivos de producto: index.ts y gmail-delivery-evidence.mjs. Las otras dieciséis dependencias del runtime no cambian. Trece pruebas backend/Gmail y Deno check; proveedores/base simulados. Sin esquema, SQL, scopes, política de envíos o cuotas nuevos. No se corrige por inferencia la causa original de una precondición.

La preparación conjunta, hashes, rollout y reversión se conservan en Bidware docs/releases/compare-delivery-20261007/README.md y .test-output/compare-delivery-release-20261007/. Requiere autorización específica antes de publicar; no se envían mensajes al verificar. Codex nativo integra y verifica; sin Claude ni cambio de modelo.
