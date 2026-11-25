-- список проєктів раунду (projectsRepository.byCycle): where cycle_id = ? order by id.
-- Індекс (cycle_id, id) віддає рядки вже в порядку id, без сортування.
-- Розширення без звуження: старий projects_cycle_idx лишається, доки його
-- використовує попередня версія (розширити → перейти → прибрати).
create index concurrently if not exists projects_cycle_id_idx on projects (cycle_id, id);
