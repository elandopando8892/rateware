## Revisión del contrato de autorización

La lectura de confirmaciones se registró como extensión del contrato con el mismo rfx.read, sensibilidad alta y alcance por tenant de list_rfx_detail. Conserva el estado de revisión humana del permiso/propietario funcional; no convierte ese estado en una aprobación productiva.

El cambio en team-roles.ts solo agrega la acción de lectura. La comprobación del propietario ocurre antes de consultar confirmaciones; no acepta owner_email enviado por el navegador. La proyección excluye tokens y las pruebas verifican que no se ejecute ninguna escritura de datos en la ruta de éxito.

La huella compartida de Rateware cambia por el bloque nuevo y por team-roles.ts; interpret-upload, QuoteDesk y rateware-storage-api también importan ese módulo compartido y por eso requieren una huella actualizada aunque no cambien sus acciones. No se cambia el comportamiento de autenticación ni los permisos de escritura existentes. Las huellas quedan estáticas en el contrato, sin recalcularlas al validar.

Base de revisión: a092a3a7. El contrato de la base valida sin errores; las advertencias/disposiciones heredadas se conservan. Esta revisión es de código y fixtures, no de producción autenticada.

Verificación final local: 23 pruebas Deno de confirmaciones/roles y contrato completo con cero errores. Cliente: Bidware #53. Backend: Rateware #168. RLS propuesto sin aplicar.
