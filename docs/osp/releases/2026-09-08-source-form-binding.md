# OSP: vinculación de evidencia por fuente

## Resultado

El adaptador de cumplimiento reconoce varios formularios cuando cada artefacto
puede vincularse inequívocamente con una fuente citada por el manifiesto revisado.
Reutiliza los recibos del productor: no crea otra tabla ni inventa una aprobación.

La consulta verifica misma organización/caso/snapshot, hash del snapshot,
pertenencia del original al snapshot, ID y hash del original aprobado de tipo
supplier_requirement. El consumidor verifica hash y tipo del archivo de salida
y busca una única cita `file:<version>` o `xlsx:<version>:...` entre formularios.
No asigna por posición, nombre ni MIME. Dos formularios que citan el mismo
original siguen bloqueados hasta contar con una vinculación más específica.

Se conserva el comportamiento legacy de un único formulario. Esta entrega no
revalida ni fortalece retroactivamente esa ruta. Para varios formularios, recibos
sin cadena verificada, fuentes no citadas, citas ambiguas y bytes distintos no
generan evidencia utilizable. La cobertura sigue desconocida: `formCoverage`
declarando 100% no acredita llenado semántico. La firma digital no es autógrafa.

## Validación

- 52 pruebas Deno aprobadas: 7 del adaptador multiformulario, 20 de estructura
  PDF/firma, 12 del contrato, 10 de requisitos mixtos y 3 de vistas Salzillo/Crane.
- Las pruebas nuevas invierten el orden y usan el mismo MIME para ambos archivos.
  Incluyen rechazo por fuente no verificada, ambigüedad, otros bytes, ausencia de
  cita y cobertura no demostrada. SQL se inyecta; no son pruebas end-to-end.
- EXPLAIN de la subconsulta sobre el Supabase compartido: correcto, sin ANALYZE
  ni escrituras. Confirma compatibilidad de nombres/tipos y planificación, no
  el comportamiento real de RLS ni de la sesión de aplicación.
- El conector rechazó SET LOCAL ROLE osp_workflow_api (42501). Se conservó el
  fallo y se consultó has_table_privilege: SELECT permitido para ese rol sobre
  las tres tablas. No se cambiaron grants. Falta el smoke con identidad real.
- Lint y formato enfocados correctos. Sólo se actualizan las 12 huellas de
  dependencias de case-api; no se agregan acciones ni permisos.
- Registro de acciones: 168/168 aprobado en el checkout aislado.

## Límite restante

El productor runtime todavía prepara una fuente por trabajo y su política de
versionado de paquetes necesita revisión para conservar varios artefactos
actuales. Este cambio habilita su evaluación cuando existan recibos verificables;
no certifica la generación múltiple productiva ni cierra Sprint 14.

Sigue completar la generación/conservación del conjunto y demostrar cobertura
del formulario sobre el archivo final. No hubo despliegue, migración, escritura
productiva, firma, correo ni webhook. La rama se publica sólo en el repositorio
privado OSP; el remoto público Rateware no recibe este cambio.
