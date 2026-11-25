-- оновлення даних, а не структури: назви, записані до того, як домен почав
-- обрізати пробіли (аудит Завдання 2, п. 3), приводяться до того самого вигляду.
-- Ідемпотентно: повторний запуск нічого не змінює.
update cycles set title = btrim(title) where title <> btrim(title);
update projects set title = btrim(title) where title <> btrim(title);
