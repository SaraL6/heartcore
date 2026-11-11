-- Checks the access rules in schema.sql against a real Postgres.
-- Run:  psql -v ON_ERROR_STOP=1 -f supabase/tests/stubs.sql -f supabase/schema.sql -f supabase/tests/rules.test.sql
-- Any failed expectation raises an error and stops the run.

\set lena '00000000-0000-0000-0000-00000000000a'
\set mia  '00000000-0000-0000-0000-00000000000b'

insert into auth.users (id, raw_user_meta_data) values
  (:'lena', '{"username":"lena"}'), (:'mia', '{"username":"lena"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"username":"X!"}');
select t_is($$select count(*)::text from profiles$$, '3', 'every new account gets a profile');
select t_is($$select count(*)::text from profiles where username = 'lena'$$, '1', 'a taken username is not reused');
select t_is($$select count(*)::text from profiles where username = 'dreamer'$$, '1', 'an invalid username falls back to a default');
update profiles set username = 'mia' where id = :'mia';

-- ===== signed in as lena =====
set role authenticated;
set request.jwt.claim.sub = :'lena';

select save_external_image('openverse', 'abc', 'https://x/y.jpg', null, 10, 20, 'cap', '{a,b}', 'me', 'https://x', 'by') as ext \gset
select t_is($$select count(*)::text from images where provider_id = 'abc'$$, '1', 'saving a library image records it');
select save_external_image('openverse', 'abc', 'https://x/y.jpg', null, 10, 20, 'cap', '{a,b}', 'me', 'https://x', 'by');
select t_is($$select count(*)::text from images where provider_id = 'abc'$$, '1', 'saving it twice does not duplicate it');

insert into hearts (user_id, image_id) values (auth.uid(), :'ext');
select t_refused(format($$insert into hearts (user_id, image_id) values (%L, %L)$$, :'mia', :'ext'), 'hearting as someone else');
insert into images (url, uploader_id) values ('https://x/mine.jpg', auth.uid());
select t_refused(format($$insert into images (url, uploader_id) values ('https://x/z.jpg', %L)$$, :'mia'), 'posting as someone else');
select t_refused($$insert into images (url, uploader_id, heart_count) values ('https://x/z.jpg', auth.uid(), 999)$$, 'posting with a forged heart count');
select t_refused($$insert into images (url, uploader_id) values ('javascript:alert(1)', auth.uid())$$, 'posting a non-web address');
select t_refused($$update images set heart_count = 500$$, 'editing heart counts');
select t_refused($$update images set removed = false$$, 'un-removing images');
select t_rows($$insert into images (kind, body, style, uploader_id) values ('text', 'stay weird', 'ink', auth.uid())$$, 1, 'posting words');
select t_refused($$insert into images (kind, body, uploader_id) values ('text', '   ', auth.uid())$$, 'an empty text post');
select t_refused($$insert into images (kind, body, url, uploader_id) values ('text', 'hi', 'https://x/y.jpg', auth.uid())$$, 'a text post that also carries a picture');
select t_refused($$insert into images (kind, uploader_id) values ('image', auth.uid())$$, 'an image post with no picture');
select t_refused($$insert into images (kind, body, style, uploader_id) values ('text', 'hi', 'comic-sans', auth.uid())$$, 'an unknown card style');
insert into collections (user_id, name) values (auth.uid(), 'faves') returning id as coll \gset
insert into collection_images values (:'coll', :'ext');
insert into follows (follower_id, following_id) values (auth.uid(), :'mia');
select t_refused($$insert into follows (follower_id, following_id) values (auth.uid(), auth.uid())$$, 'following yourself');
select t_rows($$update profiles set bio = 'tea & rain', theme = 'vintage', music = 'playlist/37i9dQZF1DXcBWIGoYBM5M' where id = auth.uid()$$, 1, 'editing your own profile');
select t_rows($$update profiles set bio = 'hacked' where id <> auth.uid()$$, 0, 'editing someone else''s profile changes nothing');
select t_refused($$update profiles set music = 'https://evil.example/x' where id = auth.uid()$$, 'profile music that is not a Spotify reference');
select t_refused($$update profiles set theme = 'nope' where id = auth.uid()$$, 'an unknown theme');
select t_refused($$update profiles set id = gen_random_uuid() where id = auth.uid()$$, 'changing a profile id');
select t_refused($$insert into admins values (auth.uid())$$, 'making yourself an admin');
select t_is($$select is_admin()::text$$, 'false', 'members are not admins');

select t_refused($$update profiles set views = 99999 where id = auth.uid()$$, 'setting your own visit count');
select t_refused($$update profiles set accent = 'red; background:url(x)' where id = auth.uid()$$, 'a profile colour that is not a plain hex colour');
select t_rows($$update profiles set accent = '#ff5c8a', mood = 'dreamy' where id = auth.uid()$$, 1, 'setting your mood and colour');
select t_is(format($$select coalesce(bump_profile_views(%L), -1)::text$$, :'lena'), '-1', 'your own visits are not counted');
select t_is(format($$select bump_profile_views(%L)::text$$, :'mia'), '1', 'visiting someone counts once per call');
insert into top_friends (user_id, friend_id, position) values (auth.uid(), :'mia', 1);
select t_refused(format($$insert into top_friends (user_id, friend_id, position) values (auth.uid(), %L, 1)$$, '00000000-0000-0000-0000-00000000000c'), 'two friends in the same top-8 slot');
select t_refused(format($$insert into top_friends (user_id, friend_id, position) values (auth.uid(), %L, 9)$$, '00000000-0000-0000-0000-00000000000c'), 'a ninth top-8 slot');
select t_refused($$insert into top_friends (user_id, friend_id, position) values (auth.uid(), auth.uid(), 2)$$, 'putting yourself in your top 8');
select t_refused(format($$insert into top_friends (user_id, friend_id, position) values (%L, auth.uid(), 1)$$, :'mia'), 'editing someone else''s top 8');
insert into guestbook (profile_id, author_id, body) values (:'mia', auth.uid(), 'hi mia!');
insert into guestbook (profile_id, author_id, body) values (:'lena', auth.uid(), 'note to self');
select t_refused(format($$insert into guestbook (profile_id, author_id, body) values (auth.uid(), %L, 'forged')$$, :'mia'), 'signing a guestbook as someone else');
select t_refused($$insert into guestbook (profile_id, author_id, body) values (auth.uid(), auth.uid(), '   ')$$, 'an empty guestbook note');

-- ===== signed in as mia =====
set request.jwt.claim.sub = :'mia';
select t_rows($$delete from top_friends$$, 0, 'cannot edit other people''s top 8');
select t_refused($$update guestbook set body = 'edited'$$, 'editing guestbook notes');
select t_rows(format($$delete from guestbook where profile_id = %L$$, :'lena'), 0, 'cannot remove notes on someone else''s profile');
select t_rows(format($$delete from guestbook where profile_id = %L$$, :'mia'), 1, 'can remove notes left on your own profile');
select t_refused(format($$insert into collection_images values (%L, %L)$$, :'coll', :'ext'), 'adding to someone else''s collection');
select t_rows($$delete from hearts$$, 0, 'cannot remove other people''s hearts');
select t_rows($$delete from images$$, 0, 'cannot delete other people''s posts');
select t_rows($$delete from collections$$, 0, 'cannot delete other people''s collections');
select t_rows($$delete from follows$$, 0, 'cannot remove other people''s follows');
insert into hearts (user_id, image_id) values (auth.uid(), :'ext');
select t_is(format($$select heart_count::text from images where id = %L$$, :'ext'), '2', 'hearts are counted');
delete from hearts where user_id = auth.uid();
select t_is(format($$select heart_count::text from images where id = %L$$, :'ext'), '1', 'unhearting lowers the count');
insert into reports (image_id, provider, provider_id, url, reason, reporter_id) values (:'ext', 'openverse', 'abc', 'https://x/y.jpg', 'copyright', auth.uid());
select t_is($$select count(*)::text from reports$$, '0', 'members cannot read reports');
select t_refused($$select admin_resolve_report((select gen_random_uuid()), true)$$, 'resolving reports as a non-admin');

-- ===== not signed in =====
reset role; set role anon; set request.jwt.claim.sub = '';
select t_is($$select count(*)::text from images$$, '3', 'anyone can browse');
select t_refused($$select save_external_image('openverse', 'zzz', 'https://x/y.jpg', null, 1, 1, '', '{}', '', '', '')$$, 'saving images while signed out');
select t_refused(format($$insert into hearts values (%L, %L)$$, :'lena', :'ext'), 'hearting while signed out');
insert into reports (provider, provider_id, url, reason, contact) values ('openverse', 'abc', 'https://x/y.jpg', 'copyright', 'owner@example.com');
select t_refused($$insert into reports (url, reason, status) values ('https://x/y.jpg', 'spam', 'dismissed')$$, 'filing a pre-closed report');
select t_is($$select count(*) filter (where removed)::text from external_status('openverse', '{abc}')$$, '0', 'library status lookup works signed out');

-- ===== lena becomes an admin and takes the picture down =====
reset role;
insert into admins values (:'lena');
update profiles set cover_url = 'https://x/y.jpg' where id = :'mia';
select id as rep from reports order by created_at limit 1 \gset
set role authenticated; set request.jwt.claim.sub = :'lena';
select t_is($$select count(*)::text from reports where status = 'open'$$, '2', 'admins can read reports');
select admin_resolve_report(:'rep', true);
select t_is($$select count(*)::text from reports where status = 'open'$$, '0', 'a takedown closes every report on that picture');
select t_is($$select count(*)::text from images$$, '2', 'a removed picture is hidden from everyone');
select t_is($$select bool_and(removed)::text from external_status('openverse', '{abc}')$$, 'true', 'the library lookup reports it as removed');
select t_is(format($$select coalesce(cover_url, 'none') from profiles where id = %L$$, :'mia'), 'none', 'a takedown clears it from profile covers');

-- ===== mia deletes her account =====
set request.jwt.claim.sub = :'mia';
select delete_my_account();
reset role;
select t_is($$select count(*)::text from profiles where username = 'mia'$$, '0', 'deleting an account removes the profile');
select t_is($$select count(*)::text from follows$$, '0', 'and the follows that pointed at it');

\echo all access-rule checks passed
