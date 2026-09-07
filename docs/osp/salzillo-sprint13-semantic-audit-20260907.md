# Sprint 13 — auditoría semántica Salzillo (inicio inmediato)

Fecha: 2026-09-07. Modelo de esta actividad: **GPT-6 Astra · High**.
Motivo: reconciliación de un libro XLSM con un correo de requisitos, un mapa de
coordenadas y el contrato de paquete; no es una tarea mecánica de celdas.

## Evidencia física reproducida

Fuente local: `Copia de Formato 3.3 Alta Cliente (1).xlsm`.

- SHA-256 de la fuente: `af45f6627106edc5fd5fd114dca56a337290301a5a059aa07f7e36f8e236b3ee`.
- Hojas visibles inspeccionadas: `1-2` y `2-2`; la hoja `BD` se conserva como
  catálogo separado.
- Macros no ejecutadas. El libro original no se modifica.
- `tools/osp-check-workbook-map.py` pasó en modo lectura:
  - 114 entradas únicas;
  - cero anclas desbloqueadas sin clasificar;
  - seis anclas desbloqueadas excluidas por áreas internas;
  - una celda bloqueada retenida como `locked_input_review` (`1-2!H16`);
  - alcance declarado por el propio verificador: coordenadas y estructura física,
    no valores, semántica, PDF, firma ni completitud.

## Matriz de cobertura del requerimiento

| Solicitud del carrier | Evidencia en el libro/mapa | Estado de cierre |
| --- | --- | --- |
| Formato 3.3 completo, dos páginas, PDF y firma autógrafa | Anclas de las hojas `1-2`/`2-2` y `declaration.signature`; no existe todavía un artefact target ni PDF final | **Bloqueado**: falta llenar/reabrir/renderizar el original y acreditar el método de firma solicitado |
| Acta constitutiva | `evidence.incorporation` (`1-2!J30`) | Requisito identificado; falta evidencia vigente y revisión humana |
| INE del representante legal | `evidence.identity` (`1-2!J32`) | Requisito identificado; falta evidencia vigente y revisión humana |
| Poder notarial, si aplica | `evidence.power_of_attorney` (`1-2!J35`) | Requisito identificado; aplicabilidad/evidencia pendientes |
| Opinión positiva SAT | `evidence.tax_opinion` (`1-2!J34`) | Requisito identificado; falta fecha y evidencia vigente |
| Constancia de situación fiscal | `evidence.tax_status` (`1-2!J33`) | Requisito identificado; falta fecha y evidencia vigente |
| Carátula del banco emisor de pagos MXN | El contrato semántico reconoce `banking.account_evidence` y el runtime reconoce `bank_statement`; el inventario físico no tiene una fila dedicada | **Gap de paquete**: debe permanecer como requisito externo explícito, sin inventar una celda ni marcarla cumplida por tener datos bancarios |
| Comprobante de domicilio | `evidence.address` (`1-2!J31`) | Requisito identificado; falta vigencia máxima y evidencia |
| Tres referencias comerciales comprobables, con nombre, teléfono y correo | Filas 1–3 (`C43:C45`, `G43:G45`, `C47:C49`); cuarta opcional | **Bloqueado**: nombres/teléfonos no sustituyen los correos faltantes; no descartar la tercera referencia |
| Cuestionario de seguridad | Nueve decisiones `1-2!D52:D55`, `H52:H55`, `J53` | **Bloqueado**: requiere respuesta explícita, no inferencia |
| Políticas de crédito | `requirementsOutsideValueMapping` en `2-2!B31:L42` | **Bloqueado**: aceptación o excepción explícita antes de firma |
| Carta bajo protesta | `requirementsOutsideValueMapping` en `2-2!B44:L51` | **Bloqueado**: presentar declaración real al firmante |

El correo y el libro usan ventanas de antigüedad distintas. Se conserva la fuente
de cada regla y se aplica el límite más estricto hasta una aclaración: un mes para
opinión SAT, constancia fiscal y carátula bancaria; tres meses para domicilio.

## Decisiones que el freno debe exigir

1. Registrar la carátula bancaria como requisito del **paquete documental**, con
   tipo aceptado, fecha efectiva/expiración y revisión; nunca como simple dato de
   `bank.name`, `bank.account` o `bank.clabe`.
2. Obtener los correos de las tres referencias. La referencia VIFAA comunicada
   hasta ahora tiene nombre y teléfono, pero no correo; las otras referencias
   tampoco deben rellenarse con dominios inventados.
3. Resolver las nueve respuestas de seguridad y la aplicabilidad del poder,
   crédito, portal y cuarta referencia con una decisión humana trazable.
4. Mantener `2-2!D17:D18` como `sensitive_hold`; no recopilar ni adjuntar usuario
   o contraseña del portal en el paquete.
5. Mantener `1-2!H16` bloqueada. No desprotegerla ni convertir una celda bloqueada
   en un falso faltante resuelto.
6. Enlazar el mapa con extracción, plantilla y snapshot revisados antes de
   producir cualquier archivo. El mapa de 114 entradas sigue siendo un borrador
   de revisión, no permiso de llenado, firma o envío.

## Resultado de esta actividad

Se confirmó que la validación geométrica del mapa es correcta pero insuficiente
para el objetivo de negocio. El freno correcto debe detener el paquete por el
gap de carátula bancaria, los correos de referencias, las respuestas de seguridad,
la firma autógrafa y la revisión de las cláusulas de crédito/declaración. Un XLSX
con pocas celdas llenas o un recibo de correo no puede pasar este gate.

No se escribieron valores en el XLSM, no se modificó el caso Salzillo, no se
subieron documentos, no se aplicaron migraciones, no se ejecutó el worker, no se
firmó ni se envió correo. Esta auditoría es local y de lectura.

## Próximo incremento seguro

Implementar el contrato de requisito externo `banking.account_evidence` en la
matriz de cumplimiento y su panel de freno, junto con una prueba que demuestre
que la ausencia de esa evidencia bloquea el paquete aunque los campos bancarios
del formulario estén completos. Usar **GPT-5.6 Sol · High** para esa integración
normal; subir a Astra sólo si la implementación revela una incompatibilidad de
persistencia, permisos o idempotencia. El resultado debe ser sintético y no debe
modificar Salzillo productivo.

## Incremento ejecutado

El contrato ahora materializa `banking.account_evidence` desde el texto citado
por el carrier cuando el manifiesto no trae una fila documental equivalente. La
regla conserva la cita original, exige evidencia aprobada y mantiene el requisito
como bloqueante; los datos bancarios del formulario no pueden satisfacerlo por
coincidencia de concepto. La matriz UI identifica el registro como evidencia de
paquete y dirige a revisión documental.

Regresión sintética validada:

- 9/9 pruebas de `request-contract.test.ts` pasan.
- `request-semantic-gate.test.ts`: 20/20 pasan.
- lint de los componentes modificados pasa.
- build de OSP pasa bajo Node 20.14.0 con advertencia de engine; el proyecto
  declara Node >=22.12.0.
- La suite Vitest de UI no pudo iniciar en este host por `ERR_REQUIRE_ESM` en
  `html-encoding-sniffer`/`@exodus/bytes`; requiere ejecutar con el runtime de
  Node declarado por el proyecto.

No se modificó el XLSM, el caso Salzillo, Supabase, migraciones, despliegues ni
ningún efecto externo.
