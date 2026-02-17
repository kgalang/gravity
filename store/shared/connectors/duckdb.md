# Connector: DuckDB (Jaffle Shop)

## Path
- `/Users/kevingalang/code/jaffle_shop_duckdb/jaffle_shop.duckdb`

## CLI Pattern
```bash
duckdb /Users/kevingalang/code/jaffle_shop_duckdb/jaffle_shop.duckdb -cmd "SELECT count(*) FROM customers;"
```

## Notes
- Favor marts (`customers`, `orders`) for business answers.
- Use dbt `schema.yml` and `docs.md` as semantic guides.
