insert into public.knowledge_sources (id, key, name, source_type, homepage_url, enabled, quality_weight, created_at, updated_at)
values
  (gen_random_uuid(), 'web', 'Web', 'web', null, true, 0.8500, now(), now()),
  (gen_random_uuid(), 'hacker_news', 'Hacker News', 'hacker_news', 'https://news.ycombinator.com', true, 0.9500, now(), now())
on conflict (key) do update
set name = excluded.name,
    source_type = excluded.source_type,
    homepage_url = excluded.homepage_url,
    enabled = excluded.enabled,
    quality_weight = excluded.quality_weight,
    updated_at = now();
