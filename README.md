# dsh-plugin-data-contract — Data Contract

Valida y infiere contratos JSON: schema-lite con required, tipos, enums y rangos para archivos o texto JSON, con errores por ruta.

## Herramientas

| Tool | Qué hace |
|---|---|
| `status` | Estado |
| `validate` | Validar datos |
| `infer` | Inferir esquema |

## Instalación

Desde **DSH → Settings → Plugins** instala `github:thegabopacheco-sudo/dsh-plugin-data-contract` y permite el script de instalación.

```
dsh plugin --profile <perfil> add github:thegabopacheco-sudo/dsh-plugin-data-contract
```

## Seguridad

- Lectura por defecto; escritura solo con `confirm:true` y pedido explícito.
- `DSH_DATA_CONTRACT_MODE=read-only` desactiva acciones.
- Listas blancas y auditoría en `<DSH_HOME>\cache\data-contract\audit.jsonl`.

## Licencia

MIT © thegabopacheco-sudo
