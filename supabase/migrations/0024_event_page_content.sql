-- Rich event landing page: per-section content (about, speakers, agenda,
-- tickets) configured by organizers in the console's Event Page tab.
-- Shape (all text values are locale maps like {"en": "..."}):
--   {
--     "about":    {"enabled": true, "heading": {}, "body": {}, "image_path": "", "stats": []},
--     "speakers": {"enabled": true, "heading": {}, "items": [{"id","name","role","org","photo_path"}]},
--     "agenda":   {"enabled": true, "heading": {}, "items": [{"id","title","time","description"}]},
--     "tickets":  {"enabled": true, "heading": {}, "items": [{"id","name","price","badge","features","highlighted"}]}
--   }
alter table events add column if not exists page_content jsonb not null default '{}';
