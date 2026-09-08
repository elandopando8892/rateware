# Protección contra sustitución de otro formulario

Estado: validación local recuperada; no desplegado. Se conserva abajo la evidencia
del intento interrumpido. Este incremento no habilita múltiples paquetes vigentes.

El índice generated_packages_one_current_supplier_completed limita el caso a
un paquete vigente. El worker sustituía ese paquete sin comparar su original.
La modificación verifica ID y hash de fuente en prepare, antes de reservar o
descargar, y vuelve a verificar bajo bloqueo de fila en recordGenerated. Una
fuente diferente o un recibo legacy sin identidad produce
SUPPLIER_PACKAGE_SOURCE_SCOPE_CONFLICT sin retirar el paquete anterior.

No permite múltiples paquetes vigentes. El modelo de conjunto, consumidores y
migración siguen pendientes. Tampoco permite reemplazar automáticamente una
versión de origen distinta aunque pertenezca al mismo documento lógico.

Se añadieron seis pruebas de reserva/registro: mismo origen, otro origen,
hash distinto, recibo legacy, primer paquete y rechazo previo a descarga.
En el primer intento no se obtuvo resultado funcional:

- Los primeros intentos fallaron al resolver imports sin extensión de la UI y
  el tipo node:assert/strict. Se ajustó el ejecutor con --unstable-sloppy-imports
  y se usaron las aserciones JSR ya utilizadas por las pruebas existentes.
- La ejecución con tipos quedó sin resultado. Se detuvo el proceso propio.
- El intento cached-only también quedó detenido y fue interrumpido.
- Se intentó aislar ejecución con --no-check; tampoco entregó resultados y
  fue interrumpido. No cuenta como prueba aprobada ni reemplaza el typecheck.
- El escaneo paralelo de huellas se interrumpió; no se actualizaron huellas
  estáticas ni se debe publicar el candidato como conforme al contrato.

Retomar primero las seis pruebas y la integración reviewed-targets, después
lint, diff y registro de acciones. Investigar el atasco si se reproduce; no
aumentar timeouts o eliminar aserciones para producir un PASS.

Sin push, commit de este WIP, cambio remoto, migración, firma ni salientes.

## Reanudación verificada

La misma ejecución con comprobación de tipos terminó correctamente, sin usar
--no-check. No se reprodujo el atasco y no se atribuye una causa sin evidencia.

- supplier-package-source-scope.test.ts: 6/6 aprobadas.
- supplier-package-reviewed-targets.integration.test.ts: 1/1, ocho pasos;
  consultas de fuentes y tablas revisadas ejecutadas sobre PGlite con esquema
  reducido. La reserva y Storage son dobles de prueba, no producción.
- runtime-permissions y xlsm-targets: 2/2 aprobadas.
- Total: 9 pruebas y 8 pasos, cero fallos. Las seis nuevas usan SQL inyectado;
  no certifican concurrencia real ni el esquema completo de Supabase.
- Lint enfocado correcto. Se corrigió el formato del test agregado al final
  del intento anterior. No se modificó lógica de negocio por ese ajuste.
- Se actualizan únicamente las siete huellas de dependencias de osp-worker,
  manteniendo acciones, permisos, metadatos y conteos existentes.
- Registro de acciones: 168/168 aprobado; formato y git diff --check correctos.

Comando de pruebas: deno test --config deno.json --cached-only --frozen
--unstable-sloppy-imports --allow-env --allow-read con los cuatro archivos
indicados. El flag de imports resuelve los imports sin extensión ya presentes
en los contratos compartidos con la UI; no omite tipos ni aserciones.

La publicación de este incremento va exclusivamente al repositorio privado
OSP. No se modifican producción, el índice de unicidad, datos, firmas ni salientes.
