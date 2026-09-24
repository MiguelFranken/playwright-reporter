import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Payload's generator assumes its schema already exists — it does not emit
  // this statement. Every website table lives under `website`; `public` stays
  // the reporter's (WEBSITE_TECHNICAL.md §5).
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "website";`)

  await db.execute(sql`
   CREATE TYPE "website"."enum_pages_hero_links_link_type" AS ENUM('internal', 'custom');
  CREATE TYPE "website"."enum_pages_hero_links_link_appearance" AS ENUM('primary', 'secondary', 'ghost', 'link');
  CREATE TYPE "website"."enum_pages_blocks_feature_grid_items_icon" AS ENUM('Activity', 'Radio', 'Bug', 'Camera', 'Video', 'Route', 'Repeat2', 'ShieldCheck', 'Database', 'Cloud', 'Users', 'KeyRound', 'GitBranch', 'Layers', 'Timer', 'Search');
  CREATE TYPE "website"."enum_pages_blocks_feature_grid_items_link_type" AS ENUM('internal', 'custom');
  CREATE TYPE "website"."enum_pages_blocks_feature_grid_header_align" AS ENUM('start', 'center');
  CREATE TYPE "website"."enum_pages_blocks_feature_grid_columns" AS ENUM('2', '3', '4');
  CREATE TYPE "website"."enum_pages_blocks_feature_grid_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum_pages_blocks_feature_grid_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum_pages_blocks_feature_showcase_header_align" AS ENUM('start', 'center');
  CREATE TYPE "website"."enum_pages_blocks_feature_showcase_media_side" AS ENUM('left', 'right');
  CREATE TYPE "website"."enum_pages_blocks_feature_showcase_visual_kind" AS ENUM('media', 'demo');
  CREATE TYPE "website"."enum_pages_blocks_feature_showcase_visual_demo" AS ENUM('active-runs', 'runs-table', 'run-summary', 'run-errors', 'result-attempts', 'dashboard-metrics', 'pass-fail-chart', 'flaky-tests', 'explorer-table');
  CREATE TYPE "website"."enum_pages_blocks_feature_showcase_visual_frame" AS ENUM('browser', 'plain');
  CREATE TYPE "website"."enum_pages_blocks_feature_showcase_link_type" AS ENUM('internal', 'custom');
  CREATE TYPE "website"."enum_pages_blocks_feature_showcase_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum_pages_blocks_feature_showcase_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum_pages_blocks_steps_steps_code_language" AS ENUM('ts', 'js', 'bash', 'yaml', 'json', 'env');
  CREATE TYPE "website"."enum_pages_blocks_steps_header_align" AS ENUM('start', 'center');
  CREATE TYPE "website"."enum_pages_blocks_steps_link_type" AS ENUM('internal', 'custom');
  CREATE TYPE "website"."enum_pages_blocks_steps_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum_pages_blocks_steps_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum_pages_blocks_code_block_tabs_language" AS ENUM('ts', 'js', 'bash', 'yaml', 'json', 'env');
  CREATE TYPE "website"."enum_pages_blocks_code_block_header_align" AS ENUM('start', 'center');
  CREATE TYPE "website"."enum_pages_blocks_code_block_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum_pages_blocks_code_block_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum_pages_blocks_product_demo_header_align" AS ENUM('start', 'center');
  CREATE TYPE "website"."enum_pages_blocks_product_demo_demo" AS ENUM('active-runs', 'runs-table', 'run-summary', 'run-errors', 'result-attempts', 'dashboard-metrics', 'pass-fail-chart', 'flaky-tests', 'explorer-table');
  CREATE TYPE "website"."enum_pages_blocks_product_demo_frame" AS ENUM('browser', 'plain');
  CREATE TYPE "website"."enum_pages_blocks_product_demo_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum_pages_blocks_product_demo_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum_pages_blocks_stats_band_header_align" AS ENUM('start', 'center');
  CREATE TYPE "website"."enum_pages_blocks_stats_band_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum_pages_blocks_stats_band_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum_pages_blocks_comparison_table_rows_cells_state" AS ENUM('yes', 'partial', 'no', 'planned');
  CREATE TYPE "website"."enum_pages_blocks_comparison_table_header_align" AS ENUM('start', 'center');
  CREATE TYPE "website"."enum_pages_blocks_comparison_table_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum_pages_blocks_comparison_table_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum_pages_blocks_faq_header_align" AS ENUM('start', 'center');
  CREATE TYPE "website"."enum_pages_blocks_faq_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum_pages_blocks_faq_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum_pages_blocks_cta_links_link_type" AS ENUM('internal', 'custom');
  CREATE TYPE "website"."enum_pages_blocks_cta_links_link_appearance" AS ENUM('primary', 'secondary', 'ghost', 'link');
  CREATE TYPE "website"."enum_pages_blocks_cta_tone" AS ENUM('default', 'accent');
  CREATE TYPE "website"."enum_pages_blocks_cta_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum_pages_blocks_cta_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum_pages_blocks_content_columns_width" AS ENUM('full', 'half', 'third');
  CREATE TYPE "website"."enum_pages_blocks_content_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum_pages_blocks_content_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum_pages_blocks_media_block_frame" AS ENUM('browser', 'plain', 'none');
  CREATE TYPE "website"."enum_pages_blocks_media_block_size" AS ENUM('content', 'wide', 'full');
  CREATE TYPE "website"."enum_pages_blocks_media_block_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum_pages_blocks_media_block_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum_pages_hero_variant" AS ENUM('none', 'centered', 'split');
  CREATE TYPE "website"."enum_pages_hero_demo" AS ENUM('active-runs', 'runs-table', 'run-summary', 'run-errors', 'result-attempts', 'dashboard-metrics', 'pass-fail-chart', 'flaky-tests', 'explorer-table');
  CREATE TYPE "website"."enum_pages_hero_snippet_language" AS ENUM('ts', 'js', 'bash', 'yaml', 'json', 'env');
  CREATE TYPE "website"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "website"."enum__pages_v_version_hero_links_link_type" AS ENUM('internal', 'custom');
  CREATE TYPE "website"."enum__pages_v_version_hero_links_link_appearance" AS ENUM('primary', 'secondary', 'ghost', 'link');
  CREATE TYPE "website"."enum__pages_v_blocks_feature_grid_items_icon" AS ENUM('Activity', 'Radio', 'Bug', 'Camera', 'Video', 'Route', 'Repeat2', 'ShieldCheck', 'Database', 'Cloud', 'Users', 'KeyRound', 'GitBranch', 'Layers', 'Timer', 'Search');
  CREATE TYPE "website"."enum__pages_v_blocks_feature_grid_items_link_type" AS ENUM('internal', 'custom');
  CREATE TYPE "website"."enum__pages_v_blocks_feature_grid_header_align" AS ENUM('start', 'center');
  CREATE TYPE "website"."enum__pages_v_blocks_feature_grid_columns" AS ENUM('2', '3', '4');
  CREATE TYPE "website"."enum__pages_v_blocks_feature_grid_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum__pages_v_blocks_feature_grid_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum__pages_v_blocks_feature_showcase_header_align" AS ENUM('start', 'center');
  CREATE TYPE "website"."enum__pages_v_blocks_feature_showcase_media_side" AS ENUM('left', 'right');
  CREATE TYPE "website"."enum__pages_v_blocks_feature_showcase_visual_kind" AS ENUM('media', 'demo');
  CREATE TYPE "website"."enum__pages_v_blocks_feature_showcase_visual_demo" AS ENUM('active-runs', 'runs-table', 'run-summary', 'run-errors', 'result-attempts', 'dashboard-metrics', 'pass-fail-chart', 'flaky-tests', 'explorer-table');
  CREATE TYPE "website"."enum__pages_v_blocks_feature_showcase_visual_frame" AS ENUM('browser', 'plain');
  CREATE TYPE "website"."enum__pages_v_blocks_feature_showcase_link_type" AS ENUM('internal', 'custom');
  CREATE TYPE "website"."enum__pages_v_blocks_feature_showcase_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum__pages_v_blocks_feature_showcase_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum__pages_v_blocks_steps_steps_code_language" AS ENUM('ts', 'js', 'bash', 'yaml', 'json', 'env');
  CREATE TYPE "website"."enum__pages_v_blocks_steps_header_align" AS ENUM('start', 'center');
  CREATE TYPE "website"."enum__pages_v_blocks_steps_link_type" AS ENUM('internal', 'custom');
  CREATE TYPE "website"."enum__pages_v_blocks_steps_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum__pages_v_blocks_steps_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum__pages_v_blocks_code_block_tabs_language" AS ENUM('ts', 'js', 'bash', 'yaml', 'json', 'env');
  CREATE TYPE "website"."enum__pages_v_blocks_code_block_header_align" AS ENUM('start', 'center');
  CREATE TYPE "website"."enum__pages_v_blocks_code_block_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum__pages_v_blocks_code_block_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum__pages_v_blocks_product_demo_header_align" AS ENUM('start', 'center');
  CREATE TYPE "website"."enum__pages_v_blocks_product_demo_demo" AS ENUM('active-runs', 'runs-table', 'run-summary', 'run-errors', 'result-attempts', 'dashboard-metrics', 'pass-fail-chart', 'flaky-tests', 'explorer-table');
  CREATE TYPE "website"."enum__pages_v_blocks_product_demo_frame" AS ENUM('browser', 'plain');
  CREATE TYPE "website"."enum__pages_v_blocks_product_demo_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum__pages_v_blocks_product_demo_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum__pages_v_blocks_stats_band_header_align" AS ENUM('start', 'center');
  CREATE TYPE "website"."enum__pages_v_blocks_stats_band_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum__pages_v_blocks_stats_band_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum__pages_v_blocks_comparison_table_rows_cells_state" AS ENUM('yes', 'partial', 'no', 'planned');
  CREATE TYPE "website"."enum__pages_v_blocks_comparison_table_header_align" AS ENUM('start', 'center');
  CREATE TYPE "website"."enum__pages_v_blocks_comparison_table_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum__pages_v_blocks_comparison_table_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum__pages_v_blocks_faq_header_align" AS ENUM('start', 'center');
  CREATE TYPE "website"."enum__pages_v_blocks_faq_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum__pages_v_blocks_faq_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum__pages_v_blocks_cta_links_link_type" AS ENUM('internal', 'custom');
  CREATE TYPE "website"."enum__pages_v_blocks_cta_links_link_appearance" AS ENUM('primary', 'secondary', 'ghost', 'link');
  CREATE TYPE "website"."enum__pages_v_blocks_cta_tone" AS ENUM('default', 'accent');
  CREATE TYPE "website"."enum__pages_v_blocks_cta_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum__pages_v_blocks_cta_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum__pages_v_blocks_content_columns_width" AS ENUM('full', 'half', 'third');
  CREATE TYPE "website"."enum__pages_v_blocks_content_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum__pages_v_blocks_content_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum__pages_v_blocks_media_block_frame" AS ENUM('browser', 'plain', 'none');
  CREATE TYPE "website"."enum__pages_v_blocks_media_block_size" AS ENUM('content', 'wide', 'full');
  CREATE TYPE "website"."enum__pages_v_blocks_media_block_settings_background" AS ENUM('default', 'sunken', 'accent');
  CREATE TYPE "website"."enum__pages_v_blocks_media_block_settings_spacing" AS ENUM('normal', 'compact');
  CREATE TYPE "website"."enum__pages_v_version_hero_variant" AS ENUM('none', 'centered', 'split');
  CREATE TYPE "website"."enum__pages_v_version_hero_demo" AS ENUM('active-runs', 'runs-table', 'run-summary', 'run-errors', 'result-attempts', 'dashboard-metrics', 'pass-fail-chart', 'flaky-tests', 'explorer-table');
  CREATE TYPE "website"."enum__pages_v_version_hero_snippet_language" AS ENUM('ts', 'js', 'bash', 'yaml', 'json', 'env');
  CREATE TYPE "website"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "website"."enum_media_theme" AS ENUM('light', 'dark', 'neutral');
  CREATE TYPE "website"."enum_users_role" AS ENUM('admin', 'editor');
  CREATE TYPE "website"."enum_redirects_to_type" AS ENUM('reference', 'custom');
  CREATE TYPE "website"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TYPE "website"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "website"."enum_payload_jobs_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TYPE "website"."enum_header_nav_items_link_type" AS ENUM('internal', 'custom');
  CREATE TYPE "website"."enum_header_ctas_link_type" AS ENUM('internal', 'custom');
  CREATE TYPE "website"."enum_header_ctas_link_appearance" AS ENUM('primary', 'secondary', 'ghost', 'link');
  CREATE TYPE "website"."enum_footer_columns_links_link_type" AS ENUM('internal', 'custom');
  CREATE TYPE "website"."enum_footer_legal_link_type" AS ENUM('internal', 'custom');
  CREATE TYPE "website"."enum_footer_social_platform" AS ENUM('github', 'x', 'linkedin', 'bluesky');
  CREATE TYPE "website"."enum_site_settings_announcement_link_type" AS ENUM('internal', 'custom');
  CREATE TYPE "website"."enum_site_settings_analytics_provider" AS ENUM('none', 'plausible', 'umami');
  CREATE TABLE "website"."pages_hero_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link_type" "website"."enum_pages_hero_links_link_type" DEFAULT 'internal',
  	"link_new_tab" boolean,
  	"link_reference_id" integer,
  	"link_url" varchar,
  	"link_label" varchar,
  	"link_appearance" "website"."enum_pages_hero_links_link_appearance" DEFAULT 'primary'
  );
  
  CREATE TABLE "website"."pages_blocks_feature_grid_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"icon" "website"."enum_pages_blocks_feature_grid_items_icon",
  	"title" varchar,
  	"description" varchar,
  	"link_type" "website"."enum_pages_blocks_feature_grid_items_link_type" DEFAULT 'internal',
  	"link_new_tab" boolean,
  	"link_reference_id" integer,
  	"link_url" varchar,
  	"link_label" varchar
  );
  
  CREATE TABLE "website"."pages_blocks_feature_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"header_eyebrow" varchar,
  	"header_heading" varchar,
  	"header_intro" jsonb,
  	"header_align" "website"."enum_pages_blocks_feature_grid_header_align" DEFAULT 'start',
  	"columns" "website"."enum_pages_blocks_feature_grid_columns" DEFAULT '3',
  	"settings_background" "website"."enum_pages_blocks_feature_grid_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum_pages_blocks_feature_grid_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."pages_blocks_feature_showcase_bullets" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "website"."pages_blocks_feature_showcase" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"header_eyebrow" varchar,
  	"header_heading" varchar,
  	"header_intro" jsonb,
  	"header_align" "website"."enum_pages_blocks_feature_showcase_header_align" DEFAULT 'start',
  	"media_side" "website"."enum_pages_blocks_feature_showcase_media_side" DEFAULT 'right',
  	"visual_kind" "website"."enum_pages_blocks_feature_showcase_visual_kind" DEFAULT 'media',
  	"visual_media_light_id" integer,
  	"visual_media_dark_id" integer,
  	"visual_demo" "website"."enum_pages_blocks_feature_showcase_visual_demo",
  	"visual_frame" "website"."enum_pages_blocks_feature_showcase_visual_frame" DEFAULT 'browser',
  	"visual_caption" varchar,
  	"link_type" "website"."enum_pages_blocks_feature_showcase_link_type" DEFAULT 'internal',
  	"link_new_tab" boolean,
  	"link_reference_id" integer,
  	"link_url" varchar,
  	"link_label" varchar,
  	"settings_background" "website"."enum_pages_blocks_feature_showcase_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum_pages_blocks_feature_showcase_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."pages_blocks_steps_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"description" jsonb,
  	"code_language" "website"."enum_pages_blocks_steps_steps_code_language" DEFAULT 'ts',
  	"code_code" varchar,
  	"media_light_id" integer,
  	"media_dark_id" integer
  );
  
  CREATE TABLE "website"."pages_blocks_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"header_eyebrow" varchar,
  	"header_heading" varchar,
  	"header_intro" jsonb,
  	"header_align" "website"."enum_pages_blocks_steps_header_align" DEFAULT 'start',
  	"link_type" "website"."enum_pages_blocks_steps_link_type" DEFAULT 'internal',
  	"link_new_tab" boolean,
  	"link_reference_id" integer,
  	"link_url" varchar,
  	"link_label" varchar,
  	"settings_background" "website"."enum_pages_blocks_steps_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum_pages_blocks_steps_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."pages_blocks_code_block_tabs" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"language" "website"."enum_pages_blocks_code_block_tabs_language" DEFAULT 'ts',
  	"code" varchar
  );
  
  CREATE TABLE "website"."pages_blocks_code_block" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"header_eyebrow" varchar,
  	"header_heading" varchar,
  	"header_intro" jsonb,
  	"header_align" "website"."enum_pages_blocks_code_block_header_align" DEFAULT 'start',
  	"caption" varchar,
  	"settings_background" "website"."enum_pages_blocks_code_block_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum_pages_blocks_code_block_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."pages_blocks_product_demo" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"header_eyebrow" varchar,
  	"header_heading" varchar,
  	"header_intro" jsonb,
  	"header_align" "website"."enum_pages_blocks_product_demo_header_align" DEFAULT 'start',
  	"demo" "website"."enum_pages_blocks_product_demo_demo",
  	"frame" "website"."enum_pages_blocks_product_demo_frame" DEFAULT 'browser',
  	"caption" varchar,
  	"settings_background" "website"."enum_pages_blocks_product_demo_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum_pages_blocks_product_demo_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."pages_blocks_stats_band_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar,
  	"label" varchar,
  	"hint" varchar
  );
  
  CREATE TABLE "website"."pages_blocks_stats_band" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"header_eyebrow" varchar,
  	"header_heading" varchar,
  	"header_intro" jsonb,
  	"header_align" "website"."enum_pages_blocks_stats_band_header_align" DEFAULT 'start',
  	"settings_background" "website"."enum_pages_blocks_stats_band_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum_pages_blocks_stats_band_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."pages_blocks_comparison_table_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"highlight" boolean
  );
  
  CREATE TABLE "website"."pages_blocks_comparison_table_rows_cells" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"state" "website"."enum_pages_blocks_comparison_table_rows_cells_state" DEFAULT 'yes',
  	"note" varchar
  );
  
  CREATE TABLE "website"."pages_blocks_comparison_table_rows" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"capability" varchar
  );
  
  CREATE TABLE "website"."pages_blocks_comparison_table" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"header_eyebrow" varchar,
  	"header_heading" varchar,
  	"header_intro" jsonb,
  	"header_align" "website"."enum_pages_blocks_comparison_table_header_align" DEFAULT 'start',
  	"footnote" jsonb,
  	"settings_background" "website"."enum_pages_blocks_comparison_table_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum_pages_blocks_comparison_table_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."pages_blocks_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" jsonb
  );
  
  CREATE TABLE "website"."pages_blocks_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"header_eyebrow" varchar,
  	"header_heading" varchar,
  	"header_intro" jsonb,
  	"header_align" "website"."enum_pages_blocks_faq_header_align" DEFAULT 'start',
  	"settings_background" "website"."enum_pages_blocks_faq_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum_pages_blocks_faq_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."pages_blocks_cta_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link_type" "website"."enum_pages_blocks_cta_links_link_type" DEFAULT 'internal',
  	"link_new_tab" boolean,
  	"link_reference_id" integer,
  	"link_url" varchar,
  	"link_label" varchar,
  	"link_appearance" "website"."enum_pages_blocks_cta_links_link_appearance" DEFAULT 'primary'
  );
  
  CREATE TABLE "website"."pages_blocks_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"text" jsonb,
  	"tone" "website"."enum_pages_blocks_cta_tone" DEFAULT 'default',
  	"settings_background" "website"."enum_pages_blocks_cta_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum_pages_blocks_cta_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."pages_blocks_content_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"width" "website"."enum_pages_blocks_content_columns_width" DEFAULT 'full',
  	"rich_text" jsonb
  );
  
  CREATE TABLE "website"."pages_blocks_content" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"settings_background" "website"."enum_pages_blocks_content_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum_pages_blocks_content_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."pages_blocks_media_block" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_light_id" integer,
  	"media_dark_id" integer,
  	"frame" "website"."enum_pages_blocks_media_block_frame" DEFAULT 'browser',
  	"size" "website"."enum_pages_blocks_media_block_size" DEFAULT 'content',
  	"caption" varchar,
  	"settings_background" "website"."enum_pages_blocks_media_block_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum_pages_blocks_media_block_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"hero_variant" "website"."enum_pages_hero_variant" DEFAULT 'centered',
  	"hero_eyebrow" varchar,
  	"hero_heading" varchar,
  	"hero_lead" jsonb,
  	"hero_demo" "website"."enum_pages_hero_demo",
  	"hero_media_light_id" integer,
  	"hero_media_dark_id" integer,
  	"hero_snippet_language" "website"."enum_pages_hero_snippet_language" DEFAULT 'ts',
  	"hero_snippet_code" varchar,
  	"generate_slug" boolean DEFAULT true,
  	"slug" varchar,
  	"published_at" timestamp(3) with time zone,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "website"."enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "website"."_pages_v_version_hero_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"link_type" "website"."enum__pages_v_version_hero_links_link_type" DEFAULT 'internal',
  	"link_new_tab" boolean,
  	"link_reference_id" integer,
  	"link_url" varchar,
  	"link_label" varchar,
  	"link_appearance" "website"."enum__pages_v_version_hero_links_link_appearance" DEFAULT 'primary',
  	"_uuid" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_feature_grid_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"icon" "website"."enum__pages_v_blocks_feature_grid_items_icon",
  	"title" varchar,
  	"description" varchar,
  	"link_type" "website"."enum__pages_v_blocks_feature_grid_items_link_type" DEFAULT 'internal',
  	"link_new_tab" boolean,
  	"link_reference_id" integer,
  	"link_url" varchar,
  	"link_label" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_feature_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"header_eyebrow" varchar,
  	"header_heading" varchar,
  	"header_intro" jsonb,
  	"header_align" "website"."enum__pages_v_blocks_feature_grid_header_align" DEFAULT 'start',
  	"columns" "website"."enum__pages_v_blocks_feature_grid_columns" DEFAULT '3',
  	"settings_background" "website"."enum__pages_v_blocks_feature_grid_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum__pages_v_blocks_feature_grid_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_feature_showcase_bullets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_feature_showcase" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"header_eyebrow" varchar,
  	"header_heading" varchar,
  	"header_intro" jsonb,
  	"header_align" "website"."enum__pages_v_blocks_feature_showcase_header_align" DEFAULT 'start',
  	"media_side" "website"."enum__pages_v_blocks_feature_showcase_media_side" DEFAULT 'right',
  	"visual_kind" "website"."enum__pages_v_blocks_feature_showcase_visual_kind" DEFAULT 'media',
  	"visual_media_light_id" integer,
  	"visual_media_dark_id" integer,
  	"visual_demo" "website"."enum__pages_v_blocks_feature_showcase_visual_demo",
  	"visual_frame" "website"."enum__pages_v_blocks_feature_showcase_visual_frame" DEFAULT 'browser',
  	"visual_caption" varchar,
  	"link_type" "website"."enum__pages_v_blocks_feature_showcase_link_type" DEFAULT 'internal',
  	"link_new_tab" boolean,
  	"link_reference_id" integer,
  	"link_url" varchar,
  	"link_label" varchar,
  	"settings_background" "website"."enum__pages_v_blocks_feature_showcase_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum__pages_v_blocks_feature_showcase_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_steps_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"description" jsonb,
  	"code_language" "website"."enum__pages_v_blocks_steps_steps_code_language" DEFAULT 'ts',
  	"code_code" varchar,
  	"media_light_id" integer,
  	"media_dark_id" integer,
  	"_uuid" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"header_eyebrow" varchar,
  	"header_heading" varchar,
  	"header_intro" jsonb,
  	"header_align" "website"."enum__pages_v_blocks_steps_header_align" DEFAULT 'start',
  	"link_type" "website"."enum__pages_v_blocks_steps_link_type" DEFAULT 'internal',
  	"link_new_tab" boolean,
  	"link_reference_id" integer,
  	"link_url" varchar,
  	"link_label" varchar,
  	"settings_background" "website"."enum__pages_v_blocks_steps_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum__pages_v_blocks_steps_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_code_block_tabs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"language" "website"."enum__pages_v_blocks_code_block_tabs_language" DEFAULT 'ts',
  	"code" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_code_block" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"header_eyebrow" varchar,
  	"header_heading" varchar,
  	"header_intro" jsonb,
  	"header_align" "website"."enum__pages_v_blocks_code_block_header_align" DEFAULT 'start',
  	"caption" varchar,
  	"settings_background" "website"."enum__pages_v_blocks_code_block_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum__pages_v_blocks_code_block_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_product_demo" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"header_eyebrow" varchar,
  	"header_heading" varchar,
  	"header_intro" jsonb,
  	"header_align" "website"."enum__pages_v_blocks_product_demo_header_align" DEFAULT 'start',
  	"demo" "website"."enum__pages_v_blocks_product_demo_demo",
  	"frame" "website"."enum__pages_v_blocks_product_demo_frame" DEFAULT 'browser',
  	"caption" varchar,
  	"settings_background" "website"."enum__pages_v_blocks_product_demo_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum__pages_v_blocks_product_demo_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_stats_band_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"value" varchar,
  	"label" varchar,
  	"hint" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_stats_band" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"header_eyebrow" varchar,
  	"header_heading" varchar,
  	"header_intro" jsonb,
  	"header_align" "website"."enum__pages_v_blocks_stats_band_header_align" DEFAULT 'start',
  	"settings_background" "website"."enum__pages_v_blocks_stats_band_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum__pages_v_blocks_stats_band_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_comparison_table_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"highlight" boolean,
  	"_uuid" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_comparison_table_rows_cells" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"state" "website"."enum__pages_v_blocks_comparison_table_rows_cells_state" DEFAULT 'yes',
  	"note" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_comparison_table_rows" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"capability" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_comparison_table" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"header_eyebrow" varchar,
  	"header_heading" varchar,
  	"header_intro" jsonb,
  	"header_align" "website"."enum__pages_v_blocks_comparison_table_header_align" DEFAULT 'start',
  	"footnote" jsonb,
  	"settings_background" "website"."enum__pages_v_blocks_comparison_table_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum__pages_v_blocks_comparison_table_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"header_eyebrow" varchar,
  	"header_heading" varchar,
  	"header_intro" jsonb,
  	"header_align" "website"."enum__pages_v_blocks_faq_header_align" DEFAULT 'start',
  	"settings_background" "website"."enum__pages_v_blocks_faq_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum__pages_v_blocks_faq_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_cta_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"link_type" "website"."enum__pages_v_blocks_cta_links_link_type" DEFAULT 'internal',
  	"link_new_tab" boolean,
  	"link_reference_id" integer,
  	"link_url" varchar,
  	"link_label" varchar,
  	"link_appearance" "website"."enum__pages_v_blocks_cta_links_link_appearance" DEFAULT 'primary',
  	"_uuid" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"text" jsonb,
  	"tone" "website"."enum__pages_v_blocks_cta_tone" DEFAULT 'default',
  	"settings_background" "website"."enum__pages_v_blocks_cta_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum__pages_v_blocks_cta_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_content_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"width" "website"."enum__pages_v_blocks_content_columns_width" DEFAULT 'full',
  	"rich_text" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_content" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"settings_background" "website"."enum__pages_v_blocks_content_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum__pages_v_blocks_content_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."_pages_v_blocks_media_block" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"media_light_id" integer,
  	"media_dark_id" integer,
  	"frame" "website"."enum__pages_v_blocks_media_block_frame" DEFAULT 'browser',
  	"size" "website"."enum__pages_v_blocks_media_block_size" DEFAULT 'content',
  	"caption" varchar,
  	"settings_background" "website"."enum__pages_v_blocks_media_block_settings_background" DEFAULT 'default',
  	"settings_spacing" "website"."enum__pages_v_blocks_media_block_settings_spacing" DEFAULT 'normal',
  	"settings_anchor" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "website"."_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_hero_variant" "website"."enum__pages_v_version_hero_variant" DEFAULT 'centered',
  	"version_hero_eyebrow" varchar,
  	"version_hero_heading" varchar,
  	"version_hero_lead" jsonb,
  	"version_hero_demo" "website"."enum__pages_v_version_hero_demo",
  	"version_hero_media_light_id" integer,
  	"version_hero_media_dark_id" integer,
  	"version_hero_snippet_language" "website"."enum__pages_v_version_hero_snippet_language" DEFAULT 'ts',
  	"version_hero_snippet_code" varchar,
  	"version_generate_slug" boolean DEFAULT true,
  	"version_slug" varchar,
  	"version_published_at" timestamp(3) with time zone,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "website"."enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "website"."media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"caption" jsonb,
  	"theme" "website"."enum_media_theme" DEFAULT 'neutral',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar,
  	"sizes_showcase_url" varchar,
  	"sizes_showcase_width" numeric,
  	"sizes_showcase_height" numeric,
  	"sizes_showcase_mime_type" varchar,
  	"sizes_showcase_filesize" numeric,
  	"sizes_showcase_filename" varchar
  );
  
  CREATE TABLE "website"."users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "website"."users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"role" "website"."enum_users_role" DEFAULT 'editor' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "website"."redirects" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"from" varchar NOT NULL,
  	"to_type" "website"."enum_redirects_to_type" DEFAULT 'reference',
  	"to_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "website"."redirects_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"pages_id" integer
  );
  
  CREATE TABLE "website"."payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "website"."payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "website"."enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "website"."enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "website"."payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "website"."enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "website"."payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "website"."payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"pages_id" integer,
  	"media_id" integer,
  	"users_id" integer,
  	"redirects_id" integer
  );
  
  CREATE TABLE "website"."payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "website"."payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "website"."payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "website"."header_nav_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link_type" "website"."enum_header_nav_items_link_type" DEFAULT 'internal',
  	"link_new_tab" boolean,
  	"link_reference_id" integer,
  	"link_url" varchar,
  	"link_label" varchar NOT NULL
  );
  
  CREATE TABLE "website"."header_ctas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link_type" "website"."enum_header_ctas_link_type" DEFAULT 'internal',
  	"link_new_tab" boolean,
  	"link_reference_id" integer,
  	"link_url" varchar,
  	"link_label" varchar NOT NULL,
  	"link_appearance" "website"."enum_header_ctas_link_appearance" DEFAULT 'primary'
  );
  
  CREATE TABLE "website"."header" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"logo_id" integer,
  	"show_github" boolean DEFAULT true,
  	"show_theme_toggle" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "website"."footer_columns_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link_type" "website"."enum_footer_columns_links_link_type" DEFAULT 'internal',
  	"link_new_tab" boolean,
  	"link_reference_id" integer,
  	"link_url" varchar,
  	"link_label" varchar NOT NULL
  );
  
  CREATE TABLE "website"."footer_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL
  );
  
  CREATE TABLE "website"."footer_legal" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link_type" "website"."enum_footer_legal_link_type" DEFAULT 'internal',
  	"link_new_tab" boolean,
  	"link_reference_id" integer,
  	"link_url" varchar,
  	"link_label" varchar NOT NULL
  );
  
  CREATE TABLE "website"."footer_social" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" "website"."enum_footer_social_platform" NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "website"."footer" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"copyright" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "website"."site_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"site_name" varchar NOT NULL,
  	"tagline" varchar,
  	"description" varchar,
  	"github_url" varchar,
  	"docs_url" varchar,
  	"default_og_image_id" integer,
  	"announcement_enabled" boolean,
  	"announcement_text" varchar,
  	"announcement_link_type" "website"."enum_site_settings_announcement_link_type" DEFAULT 'internal',
  	"announcement_link_new_tab" boolean,
  	"announcement_link_reference_id" integer,
  	"announcement_link_url" varchar,
  	"announcement_link_label" varchar,
  	"analytics_provider" "website"."enum_site_settings_analytics_provider" DEFAULT 'none',
  	"analytics_domain" varchar,
  	"analytics_script_url" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "website"."pages_hero_links" ADD CONSTRAINT "pages_hero_links_link_reference_id_pages_id_fk" FOREIGN KEY ("link_reference_id") REFERENCES "website"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."pages_hero_links" ADD CONSTRAINT "pages_hero_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_feature_grid_items" ADD CONSTRAINT "pages_blocks_feature_grid_items_link_reference_id_pages_id_fk" FOREIGN KEY ("link_reference_id") REFERENCES "website"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_feature_grid_items" ADD CONSTRAINT "pages_blocks_feature_grid_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages_blocks_feature_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_feature_grid" ADD CONSTRAINT "pages_blocks_feature_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_feature_showcase_bullets" ADD CONSTRAINT "pages_blocks_feature_showcase_bullets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages_blocks_feature_showcase"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_feature_showcase" ADD CONSTRAINT "pages_blocks_feature_showcase_visual_media_light_id_media_id_fk" FOREIGN KEY ("visual_media_light_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_feature_showcase" ADD CONSTRAINT "pages_blocks_feature_showcase_visual_media_dark_id_media_id_fk" FOREIGN KEY ("visual_media_dark_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_feature_showcase" ADD CONSTRAINT "pages_blocks_feature_showcase_link_reference_id_pages_id_fk" FOREIGN KEY ("link_reference_id") REFERENCES "website"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_feature_showcase" ADD CONSTRAINT "pages_blocks_feature_showcase_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_steps_steps" ADD CONSTRAINT "pages_blocks_steps_steps_media_light_id_media_id_fk" FOREIGN KEY ("media_light_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_steps_steps" ADD CONSTRAINT "pages_blocks_steps_steps_media_dark_id_media_id_fk" FOREIGN KEY ("media_dark_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_steps_steps" ADD CONSTRAINT "pages_blocks_steps_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages_blocks_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_steps" ADD CONSTRAINT "pages_blocks_steps_link_reference_id_pages_id_fk" FOREIGN KEY ("link_reference_id") REFERENCES "website"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_steps" ADD CONSTRAINT "pages_blocks_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_code_block_tabs" ADD CONSTRAINT "pages_blocks_code_block_tabs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages_blocks_code_block"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_code_block" ADD CONSTRAINT "pages_blocks_code_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_product_demo" ADD CONSTRAINT "pages_blocks_product_demo_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_stats_band_items" ADD CONSTRAINT "pages_blocks_stats_band_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages_blocks_stats_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_stats_band" ADD CONSTRAINT "pages_blocks_stats_band_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_comparison_table_columns" ADD CONSTRAINT "pages_blocks_comparison_table_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages_blocks_comparison_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_comparison_table_rows_cells" ADD CONSTRAINT "pages_blocks_comparison_table_rows_cells_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages_blocks_comparison_table_rows"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_comparison_table_rows" ADD CONSTRAINT "pages_blocks_comparison_table_rows_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages_blocks_comparison_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_comparison_table" ADD CONSTRAINT "pages_blocks_comparison_table_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_faq_items" ADD CONSTRAINT "pages_blocks_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_faq" ADD CONSTRAINT "pages_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_cta_links" ADD CONSTRAINT "pages_blocks_cta_links_link_reference_id_pages_id_fk" FOREIGN KEY ("link_reference_id") REFERENCES "website"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_cta_links" ADD CONSTRAINT "pages_blocks_cta_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages_blocks_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_cta" ADD CONSTRAINT "pages_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_content_columns" ADD CONSTRAINT "pages_blocks_content_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages_blocks_content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_content" ADD CONSTRAINT "pages_blocks_content_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_media_block" ADD CONSTRAINT "pages_blocks_media_block_media_light_id_media_id_fk" FOREIGN KEY ("media_light_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_media_block" ADD CONSTRAINT "pages_blocks_media_block_media_dark_id_media_id_fk" FOREIGN KEY ("media_dark_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."pages_blocks_media_block" ADD CONSTRAINT "pages_blocks_media_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."pages" ADD CONSTRAINT "pages_hero_media_light_id_media_id_fk" FOREIGN KEY ("hero_media_light_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."pages" ADD CONSTRAINT "pages_hero_media_dark_id_media_id_fk" FOREIGN KEY ("hero_media_dark_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."pages" ADD CONSTRAINT "pages_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_version_hero_links" ADD CONSTRAINT "_pages_v_version_hero_links_link_reference_id_pages_id_fk" FOREIGN KEY ("link_reference_id") REFERENCES "website"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_version_hero_links" ADD CONSTRAINT "_pages_v_version_hero_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_feature_grid_items" ADD CONSTRAINT "_pages_v_blocks_feature_grid_items_link_reference_id_pages_id_fk" FOREIGN KEY ("link_reference_id") REFERENCES "website"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_feature_grid_items" ADD CONSTRAINT "_pages_v_blocks_feature_grid_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v_blocks_feature_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_feature_grid" ADD CONSTRAINT "_pages_v_blocks_feature_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_feature_showcase_bullets" ADD CONSTRAINT "_pages_v_blocks_feature_showcase_bullets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v_blocks_feature_showcase"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_feature_showcase" ADD CONSTRAINT "_pages_v_blocks_feature_showcase_visual_media_light_id_media_id_fk" FOREIGN KEY ("visual_media_light_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_feature_showcase" ADD CONSTRAINT "_pages_v_blocks_feature_showcase_visual_media_dark_id_media_id_fk" FOREIGN KEY ("visual_media_dark_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_feature_showcase" ADD CONSTRAINT "_pages_v_blocks_feature_showcase_link_reference_id_pages_id_fk" FOREIGN KEY ("link_reference_id") REFERENCES "website"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_feature_showcase" ADD CONSTRAINT "_pages_v_blocks_feature_showcase_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_steps_steps" ADD CONSTRAINT "_pages_v_blocks_steps_steps_media_light_id_media_id_fk" FOREIGN KEY ("media_light_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_steps_steps" ADD CONSTRAINT "_pages_v_blocks_steps_steps_media_dark_id_media_id_fk" FOREIGN KEY ("media_dark_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_steps_steps" ADD CONSTRAINT "_pages_v_blocks_steps_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v_blocks_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_steps" ADD CONSTRAINT "_pages_v_blocks_steps_link_reference_id_pages_id_fk" FOREIGN KEY ("link_reference_id") REFERENCES "website"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_steps" ADD CONSTRAINT "_pages_v_blocks_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_code_block_tabs" ADD CONSTRAINT "_pages_v_blocks_code_block_tabs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v_blocks_code_block"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_code_block" ADD CONSTRAINT "_pages_v_blocks_code_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_product_demo" ADD CONSTRAINT "_pages_v_blocks_product_demo_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_stats_band_items" ADD CONSTRAINT "_pages_v_blocks_stats_band_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v_blocks_stats_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_stats_band" ADD CONSTRAINT "_pages_v_blocks_stats_band_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_comparison_table_columns" ADD CONSTRAINT "_pages_v_blocks_comparison_table_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v_blocks_comparison_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_comparison_table_rows_cells" ADD CONSTRAINT "_pages_v_blocks_comparison_table_rows_cells_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v_blocks_comparison_table_rows"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_comparison_table_rows" ADD CONSTRAINT "_pages_v_blocks_comparison_table_rows_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v_blocks_comparison_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_comparison_table" ADD CONSTRAINT "_pages_v_blocks_comparison_table_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_faq_items" ADD CONSTRAINT "_pages_v_blocks_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_faq" ADD CONSTRAINT "_pages_v_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_cta_links" ADD CONSTRAINT "_pages_v_blocks_cta_links_link_reference_id_pages_id_fk" FOREIGN KEY ("link_reference_id") REFERENCES "website"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_cta_links" ADD CONSTRAINT "_pages_v_blocks_cta_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v_blocks_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_cta" ADD CONSTRAINT "_pages_v_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_content_columns" ADD CONSTRAINT "_pages_v_blocks_content_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v_blocks_content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_content" ADD CONSTRAINT "_pages_v_blocks_content_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_media_block" ADD CONSTRAINT "_pages_v_blocks_media_block_media_light_id_media_id_fk" FOREIGN KEY ("media_light_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_media_block" ADD CONSTRAINT "_pages_v_blocks_media_block_media_dark_id_media_id_fk" FOREIGN KEY ("media_dark_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."_pages_v_blocks_media_block" ADD CONSTRAINT "_pages_v_blocks_media_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "website"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."_pages_v" ADD CONSTRAINT "_pages_v_version_hero_media_light_id_media_id_fk" FOREIGN KEY ("version_hero_media_light_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."_pages_v" ADD CONSTRAINT "_pages_v_version_hero_media_dark_id_media_id_fk" FOREIGN KEY ("version_hero_media_dark_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."_pages_v" ADD CONSTRAINT "_pages_v_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."redirects_rels" ADD CONSTRAINT "redirects_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "website"."redirects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."redirects_rels" ADD CONSTRAINT "redirects_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "website"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "website"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "website"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "website"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "website"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_redirects_fk" FOREIGN KEY ("redirects_id") REFERENCES "website"."redirects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "website"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "website"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."header_nav_items" ADD CONSTRAINT "header_nav_items_link_reference_id_pages_id_fk" FOREIGN KEY ("link_reference_id") REFERENCES "website"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."header_nav_items" ADD CONSTRAINT "header_nav_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."header_ctas" ADD CONSTRAINT "header_ctas_link_reference_id_pages_id_fk" FOREIGN KEY ("link_reference_id") REFERENCES "website"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."header_ctas" ADD CONSTRAINT "header_ctas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."header" ADD CONSTRAINT "header_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."footer_columns_links" ADD CONSTRAINT "footer_columns_links_link_reference_id_pages_id_fk" FOREIGN KEY ("link_reference_id") REFERENCES "website"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."footer_columns_links" ADD CONSTRAINT "footer_columns_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."footer_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."footer_columns" ADD CONSTRAINT "footer_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."footer_legal" ADD CONSTRAINT "footer_legal_link_reference_id_pages_id_fk" FOREIGN KEY ("link_reference_id") REFERENCES "website"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."footer_legal" ADD CONSTRAINT "footer_legal_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."footer_social" ADD CONSTRAINT "footer_social_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "website"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website"."site_settings" ADD CONSTRAINT "site_settings_default_og_image_id_media_id_fk" FOREIGN KEY ("default_og_image_id") REFERENCES "website"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website"."site_settings" ADD CONSTRAINT "site_settings_announcement_link_reference_id_pages_id_fk" FOREIGN KEY ("announcement_link_reference_id") REFERENCES "website"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "pages_hero_links_order_idx" ON "website"."pages_hero_links" USING btree ("_order");
  CREATE INDEX "pages_hero_links_parent_id_idx" ON "website"."pages_hero_links" USING btree ("_parent_id");
  CREATE INDEX "pages_hero_links_link_link_reference_idx" ON "website"."pages_hero_links" USING btree ("link_reference_id");
  CREATE INDEX "pages_blocks_feature_grid_items_order_idx" ON "website"."pages_blocks_feature_grid_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_feature_grid_items_parent_id_idx" ON "website"."pages_blocks_feature_grid_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_feature_grid_items_link_link_reference_idx" ON "website"."pages_blocks_feature_grid_items" USING btree ("link_reference_id");
  CREATE INDEX "pages_blocks_feature_grid_order_idx" ON "website"."pages_blocks_feature_grid" USING btree ("_order");
  CREATE INDEX "pages_blocks_feature_grid_parent_id_idx" ON "website"."pages_blocks_feature_grid" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_feature_grid_path_idx" ON "website"."pages_blocks_feature_grid" USING btree ("_path");
  CREATE INDEX "pages_blocks_feature_showcase_bullets_order_idx" ON "website"."pages_blocks_feature_showcase_bullets" USING btree ("_order");
  CREATE INDEX "pages_blocks_feature_showcase_bullets_parent_id_idx" ON "website"."pages_blocks_feature_showcase_bullets" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_feature_showcase_order_idx" ON "website"."pages_blocks_feature_showcase" USING btree ("_order");
  CREATE INDEX "pages_blocks_feature_showcase_parent_id_idx" ON "website"."pages_blocks_feature_showcase" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_feature_showcase_path_idx" ON "website"."pages_blocks_feature_showcase" USING btree ("_path");
  CREATE INDEX "pages_blocks_feature_showcase_visual_media_visual_media__idx" ON "website"."pages_blocks_feature_showcase" USING btree ("visual_media_light_id");
  CREATE INDEX "pages_blocks_feature_showcase_visual_media_visual_medi_1_idx" ON "website"."pages_blocks_feature_showcase" USING btree ("visual_media_dark_id");
  CREATE INDEX "pages_blocks_feature_showcase_link_link_reference_idx" ON "website"."pages_blocks_feature_showcase" USING btree ("link_reference_id");
  CREATE INDEX "pages_blocks_steps_steps_order_idx" ON "website"."pages_blocks_steps_steps" USING btree ("_order");
  CREATE INDEX "pages_blocks_steps_steps_parent_id_idx" ON "website"."pages_blocks_steps_steps" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_steps_steps_media_media_light_idx" ON "website"."pages_blocks_steps_steps" USING btree ("media_light_id");
  CREATE INDEX "pages_blocks_steps_steps_media_media_dark_idx" ON "website"."pages_blocks_steps_steps" USING btree ("media_dark_id");
  CREATE INDEX "pages_blocks_steps_order_idx" ON "website"."pages_blocks_steps" USING btree ("_order");
  CREATE INDEX "pages_blocks_steps_parent_id_idx" ON "website"."pages_blocks_steps" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_steps_path_idx" ON "website"."pages_blocks_steps" USING btree ("_path");
  CREATE INDEX "pages_blocks_steps_link_link_reference_idx" ON "website"."pages_blocks_steps" USING btree ("link_reference_id");
  CREATE INDEX "pages_blocks_code_block_tabs_order_idx" ON "website"."pages_blocks_code_block_tabs" USING btree ("_order");
  CREATE INDEX "pages_blocks_code_block_tabs_parent_id_idx" ON "website"."pages_blocks_code_block_tabs" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_code_block_order_idx" ON "website"."pages_blocks_code_block" USING btree ("_order");
  CREATE INDEX "pages_blocks_code_block_parent_id_idx" ON "website"."pages_blocks_code_block" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_code_block_path_idx" ON "website"."pages_blocks_code_block" USING btree ("_path");
  CREATE INDEX "pages_blocks_product_demo_order_idx" ON "website"."pages_blocks_product_demo" USING btree ("_order");
  CREATE INDEX "pages_blocks_product_demo_parent_id_idx" ON "website"."pages_blocks_product_demo" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_product_demo_path_idx" ON "website"."pages_blocks_product_demo" USING btree ("_path");
  CREATE INDEX "pages_blocks_stats_band_items_order_idx" ON "website"."pages_blocks_stats_band_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_stats_band_items_parent_id_idx" ON "website"."pages_blocks_stats_band_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_stats_band_order_idx" ON "website"."pages_blocks_stats_band" USING btree ("_order");
  CREATE INDEX "pages_blocks_stats_band_parent_id_idx" ON "website"."pages_blocks_stats_band" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_stats_band_path_idx" ON "website"."pages_blocks_stats_band" USING btree ("_path");
  CREATE INDEX "pages_blocks_comparison_table_columns_order_idx" ON "website"."pages_blocks_comparison_table_columns" USING btree ("_order");
  CREATE INDEX "pages_blocks_comparison_table_columns_parent_id_idx" ON "website"."pages_blocks_comparison_table_columns" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_comparison_table_rows_cells_order_idx" ON "website"."pages_blocks_comparison_table_rows_cells" USING btree ("_order");
  CREATE INDEX "pages_blocks_comparison_table_rows_cells_parent_id_idx" ON "website"."pages_blocks_comparison_table_rows_cells" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_comparison_table_rows_order_idx" ON "website"."pages_blocks_comparison_table_rows" USING btree ("_order");
  CREATE INDEX "pages_blocks_comparison_table_rows_parent_id_idx" ON "website"."pages_blocks_comparison_table_rows" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_comparison_table_order_idx" ON "website"."pages_blocks_comparison_table" USING btree ("_order");
  CREATE INDEX "pages_blocks_comparison_table_parent_id_idx" ON "website"."pages_blocks_comparison_table" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_comparison_table_path_idx" ON "website"."pages_blocks_comparison_table" USING btree ("_path");
  CREATE INDEX "pages_blocks_faq_items_order_idx" ON "website"."pages_blocks_faq_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_faq_items_parent_id_idx" ON "website"."pages_blocks_faq_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_faq_order_idx" ON "website"."pages_blocks_faq" USING btree ("_order");
  CREATE INDEX "pages_blocks_faq_parent_id_idx" ON "website"."pages_blocks_faq" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_faq_path_idx" ON "website"."pages_blocks_faq" USING btree ("_path");
  CREATE INDEX "pages_blocks_cta_links_order_idx" ON "website"."pages_blocks_cta_links" USING btree ("_order");
  CREATE INDEX "pages_blocks_cta_links_parent_id_idx" ON "website"."pages_blocks_cta_links" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_cta_links_link_link_reference_idx" ON "website"."pages_blocks_cta_links" USING btree ("link_reference_id");
  CREATE INDEX "pages_blocks_cta_order_idx" ON "website"."pages_blocks_cta" USING btree ("_order");
  CREATE INDEX "pages_blocks_cta_parent_id_idx" ON "website"."pages_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_cta_path_idx" ON "website"."pages_blocks_cta" USING btree ("_path");
  CREATE INDEX "pages_blocks_content_columns_order_idx" ON "website"."pages_blocks_content_columns" USING btree ("_order");
  CREATE INDEX "pages_blocks_content_columns_parent_id_idx" ON "website"."pages_blocks_content_columns" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_content_order_idx" ON "website"."pages_blocks_content" USING btree ("_order");
  CREATE INDEX "pages_blocks_content_parent_id_idx" ON "website"."pages_blocks_content" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_content_path_idx" ON "website"."pages_blocks_content" USING btree ("_path");
  CREATE INDEX "pages_blocks_media_block_order_idx" ON "website"."pages_blocks_media_block" USING btree ("_order");
  CREATE INDEX "pages_blocks_media_block_parent_id_idx" ON "website"."pages_blocks_media_block" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_media_block_path_idx" ON "website"."pages_blocks_media_block" USING btree ("_path");
  CREATE INDEX "pages_blocks_media_block_media_media_light_idx" ON "website"."pages_blocks_media_block" USING btree ("media_light_id");
  CREATE INDEX "pages_blocks_media_block_media_media_dark_idx" ON "website"."pages_blocks_media_block" USING btree ("media_dark_id");
  CREATE INDEX "pages_hero_media_hero_media_light_idx" ON "website"."pages" USING btree ("hero_media_light_id");
  CREATE INDEX "pages_hero_media_hero_media_dark_idx" ON "website"."pages" USING btree ("hero_media_dark_id");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "website"."pages" USING btree ("slug");
  CREATE INDEX "pages_meta_meta_image_idx" ON "website"."pages" USING btree ("meta_image_id");
  CREATE INDEX "pages_updated_at_idx" ON "website"."pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "website"."pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "website"."pages" USING btree ("_status");
  CREATE INDEX "_pages_v_version_hero_links_order_idx" ON "website"."_pages_v_version_hero_links" USING btree ("_order");
  CREATE INDEX "_pages_v_version_hero_links_parent_id_idx" ON "website"."_pages_v_version_hero_links" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_version_hero_links_link_link_reference_idx" ON "website"."_pages_v_version_hero_links" USING btree ("link_reference_id");
  CREATE INDEX "_pages_v_blocks_feature_grid_items_order_idx" ON "website"."_pages_v_blocks_feature_grid_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_feature_grid_items_parent_id_idx" ON "website"."_pages_v_blocks_feature_grid_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_feature_grid_items_link_link_reference_idx" ON "website"."_pages_v_blocks_feature_grid_items" USING btree ("link_reference_id");
  CREATE INDEX "_pages_v_blocks_feature_grid_order_idx" ON "website"."_pages_v_blocks_feature_grid" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_feature_grid_parent_id_idx" ON "website"."_pages_v_blocks_feature_grid" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_feature_grid_path_idx" ON "website"."_pages_v_blocks_feature_grid" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_feature_showcase_bullets_order_idx" ON "website"."_pages_v_blocks_feature_showcase_bullets" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_feature_showcase_bullets_parent_id_idx" ON "website"."_pages_v_blocks_feature_showcase_bullets" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_feature_showcase_order_idx" ON "website"."_pages_v_blocks_feature_showcase" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_feature_showcase_parent_id_idx" ON "website"."_pages_v_blocks_feature_showcase" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_feature_showcase_path_idx" ON "website"."_pages_v_blocks_feature_showcase" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_feature_showcase_visual_media_visual_med_idx" ON "website"."_pages_v_blocks_feature_showcase" USING btree ("visual_media_light_id");
  CREATE INDEX "_pages_v_blocks_feature_showcase_visual_media_visual_m_1_idx" ON "website"."_pages_v_blocks_feature_showcase" USING btree ("visual_media_dark_id");
  CREATE INDEX "_pages_v_blocks_feature_showcase_link_link_reference_idx" ON "website"."_pages_v_blocks_feature_showcase" USING btree ("link_reference_id");
  CREATE INDEX "_pages_v_blocks_steps_steps_order_idx" ON "website"."_pages_v_blocks_steps_steps" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_steps_steps_parent_id_idx" ON "website"."_pages_v_blocks_steps_steps" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_steps_steps_media_media_light_idx" ON "website"."_pages_v_blocks_steps_steps" USING btree ("media_light_id");
  CREATE INDEX "_pages_v_blocks_steps_steps_media_media_dark_idx" ON "website"."_pages_v_blocks_steps_steps" USING btree ("media_dark_id");
  CREATE INDEX "_pages_v_blocks_steps_order_idx" ON "website"."_pages_v_blocks_steps" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_steps_parent_id_idx" ON "website"."_pages_v_blocks_steps" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_steps_path_idx" ON "website"."_pages_v_blocks_steps" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_steps_link_link_reference_idx" ON "website"."_pages_v_blocks_steps" USING btree ("link_reference_id");
  CREATE INDEX "_pages_v_blocks_code_block_tabs_order_idx" ON "website"."_pages_v_blocks_code_block_tabs" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_code_block_tabs_parent_id_idx" ON "website"."_pages_v_blocks_code_block_tabs" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_code_block_order_idx" ON "website"."_pages_v_blocks_code_block" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_code_block_parent_id_idx" ON "website"."_pages_v_blocks_code_block" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_code_block_path_idx" ON "website"."_pages_v_blocks_code_block" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_product_demo_order_idx" ON "website"."_pages_v_blocks_product_demo" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_product_demo_parent_id_idx" ON "website"."_pages_v_blocks_product_demo" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_product_demo_path_idx" ON "website"."_pages_v_blocks_product_demo" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_stats_band_items_order_idx" ON "website"."_pages_v_blocks_stats_band_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_stats_band_items_parent_id_idx" ON "website"."_pages_v_blocks_stats_band_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_stats_band_order_idx" ON "website"."_pages_v_blocks_stats_band" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_stats_band_parent_id_idx" ON "website"."_pages_v_blocks_stats_band" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_stats_band_path_idx" ON "website"."_pages_v_blocks_stats_band" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_comparison_table_columns_order_idx" ON "website"."_pages_v_blocks_comparison_table_columns" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_comparison_table_columns_parent_id_idx" ON "website"."_pages_v_blocks_comparison_table_columns" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_comparison_table_rows_cells_order_idx" ON "website"."_pages_v_blocks_comparison_table_rows_cells" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_comparison_table_rows_cells_parent_id_idx" ON "website"."_pages_v_blocks_comparison_table_rows_cells" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_comparison_table_rows_order_idx" ON "website"."_pages_v_blocks_comparison_table_rows" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_comparison_table_rows_parent_id_idx" ON "website"."_pages_v_blocks_comparison_table_rows" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_comparison_table_order_idx" ON "website"."_pages_v_blocks_comparison_table" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_comparison_table_parent_id_idx" ON "website"."_pages_v_blocks_comparison_table" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_comparison_table_path_idx" ON "website"."_pages_v_blocks_comparison_table" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_faq_items_order_idx" ON "website"."_pages_v_blocks_faq_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_faq_items_parent_id_idx" ON "website"."_pages_v_blocks_faq_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_faq_order_idx" ON "website"."_pages_v_blocks_faq" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_faq_parent_id_idx" ON "website"."_pages_v_blocks_faq" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_faq_path_idx" ON "website"."_pages_v_blocks_faq" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_cta_links_order_idx" ON "website"."_pages_v_blocks_cta_links" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_cta_links_parent_id_idx" ON "website"."_pages_v_blocks_cta_links" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_cta_links_link_link_reference_idx" ON "website"."_pages_v_blocks_cta_links" USING btree ("link_reference_id");
  CREATE INDEX "_pages_v_blocks_cta_order_idx" ON "website"."_pages_v_blocks_cta" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_cta_parent_id_idx" ON "website"."_pages_v_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_cta_path_idx" ON "website"."_pages_v_blocks_cta" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_content_columns_order_idx" ON "website"."_pages_v_blocks_content_columns" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_content_columns_parent_id_idx" ON "website"."_pages_v_blocks_content_columns" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_content_order_idx" ON "website"."_pages_v_blocks_content" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_content_parent_id_idx" ON "website"."_pages_v_blocks_content" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_content_path_idx" ON "website"."_pages_v_blocks_content" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_media_block_order_idx" ON "website"."_pages_v_blocks_media_block" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_media_block_parent_id_idx" ON "website"."_pages_v_blocks_media_block" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_media_block_path_idx" ON "website"."_pages_v_blocks_media_block" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_media_block_media_media_light_idx" ON "website"."_pages_v_blocks_media_block" USING btree ("media_light_id");
  CREATE INDEX "_pages_v_blocks_media_block_media_media_dark_idx" ON "website"."_pages_v_blocks_media_block" USING btree ("media_dark_id");
  CREATE INDEX "_pages_v_parent_idx" ON "website"."_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_hero_media_version_hero_media_light_idx" ON "website"."_pages_v" USING btree ("version_hero_media_light_id");
  CREATE INDEX "_pages_v_version_hero_media_version_hero_media_dark_idx" ON "website"."_pages_v" USING btree ("version_hero_media_dark_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "website"."_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_meta_version_meta_image_idx" ON "website"."_pages_v" USING btree ("version_meta_image_id");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "website"."_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "website"."_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "website"."_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "website"."_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "website"."_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_latest_idx" ON "website"."_pages_v" USING btree ("latest");
  CREATE INDEX "_pages_v_autosave_idx" ON "website"."_pages_v" USING btree ("autosave");
  CREATE INDEX "media_updated_at_idx" ON "website"."media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "website"."media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "website"."media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "website"."media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "website"."media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_showcase_sizes_showcase_filename_idx" ON "website"."media" USING btree ("sizes_showcase_filename");
  CREATE INDEX "users_sessions_order_idx" ON "website"."users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "website"."users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "website"."users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "website"."users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "website"."users" USING btree ("email");
  CREATE UNIQUE INDEX "redirects_from_idx" ON "website"."redirects" USING btree ("from");
  CREATE INDEX "redirects_updated_at_idx" ON "website"."redirects" USING btree ("updated_at");
  CREATE INDEX "redirects_created_at_idx" ON "website"."redirects" USING btree ("created_at");
  CREATE INDEX "redirects_rels_order_idx" ON "website"."redirects_rels" USING btree ("order");
  CREATE INDEX "redirects_rels_parent_idx" ON "website"."redirects_rels" USING btree ("parent_id");
  CREATE INDEX "redirects_rels_path_idx" ON "website"."redirects_rels" USING btree ("path");
  CREATE INDEX "redirects_rels_pages_id_idx" ON "website"."redirects_rels" USING btree ("pages_id");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "website"."payload_kv" USING btree ("key");
  CREATE INDEX "payload_jobs_log_order_idx" ON "website"."payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "website"."payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "website"."payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "website"."payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "website"."payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "website"."payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "website"."payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "website"."payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "website"."payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "website"."payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "website"."payload_jobs" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "website"."payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "website"."payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "website"."payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "website"."payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "website"."payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "website"."payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "website"."payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "website"."payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "website"."payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_redirects_id_idx" ON "website"."payload_locked_documents_rels" USING btree ("redirects_id");
  CREATE INDEX "payload_preferences_key_idx" ON "website"."payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "website"."payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "website"."payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "website"."payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "website"."payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "website"."payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "website"."payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "website"."payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "website"."payload_migrations" USING btree ("created_at");
  CREATE INDEX "header_nav_items_order_idx" ON "website"."header_nav_items" USING btree ("_order");
  CREATE INDEX "header_nav_items_parent_id_idx" ON "website"."header_nav_items" USING btree ("_parent_id");
  CREATE INDEX "header_nav_items_link_link_reference_idx" ON "website"."header_nav_items" USING btree ("link_reference_id");
  CREATE INDEX "header_ctas_order_idx" ON "website"."header_ctas" USING btree ("_order");
  CREATE INDEX "header_ctas_parent_id_idx" ON "website"."header_ctas" USING btree ("_parent_id");
  CREATE INDEX "header_ctas_link_link_reference_idx" ON "website"."header_ctas" USING btree ("link_reference_id");
  CREATE INDEX "header_logo_idx" ON "website"."header" USING btree ("logo_id");
  CREATE INDEX "footer_columns_links_order_idx" ON "website"."footer_columns_links" USING btree ("_order");
  CREATE INDEX "footer_columns_links_parent_id_idx" ON "website"."footer_columns_links" USING btree ("_parent_id");
  CREATE INDEX "footer_columns_links_link_link_reference_idx" ON "website"."footer_columns_links" USING btree ("link_reference_id");
  CREATE INDEX "footer_columns_order_idx" ON "website"."footer_columns" USING btree ("_order");
  CREATE INDEX "footer_columns_parent_id_idx" ON "website"."footer_columns" USING btree ("_parent_id");
  CREATE INDEX "footer_legal_order_idx" ON "website"."footer_legal" USING btree ("_order");
  CREATE INDEX "footer_legal_parent_id_idx" ON "website"."footer_legal" USING btree ("_parent_id");
  CREATE INDEX "footer_legal_link_link_reference_idx" ON "website"."footer_legal" USING btree ("link_reference_id");
  CREATE INDEX "footer_social_order_idx" ON "website"."footer_social" USING btree ("_order");
  CREATE INDEX "footer_social_parent_id_idx" ON "website"."footer_social" USING btree ("_parent_id");
  CREATE INDEX "site_settings_default_og_image_idx" ON "website"."site_settings" USING btree ("default_og_image_id");
  CREATE INDEX "site_settings_announcement_link_announcement_link_refere_idx" ON "website"."site_settings" USING btree ("announcement_link_reference_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "website"."pages_hero_links" CASCADE;
  DROP TABLE "website"."pages_blocks_feature_grid_items" CASCADE;
  DROP TABLE "website"."pages_blocks_feature_grid" CASCADE;
  DROP TABLE "website"."pages_blocks_feature_showcase_bullets" CASCADE;
  DROP TABLE "website"."pages_blocks_feature_showcase" CASCADE;
  DROP TABLE "website"."pages_blocks_steps_steps" CASCADE;
  DROP TABLE "website"."pages_blocks_steps" CASCADE;
  DROP TABLE "website"."pages_blocks_code_block_tabs" CASCADE;
  DROP TABLE "website"."pages_blocks_code_block" CASCADE;
  DROP TABLE "website"."pages_blocks_product_demo" CASCADE;
  DROP TABLE "website"."pages_blocks_stats_band_items" CASCADE;
  DROP TABLE "website"."pages_blocks_stats_band" CASCADE;
  DROP TABLE "website"."pages_blocks_comparison_table_columns" CASCADE;
  DROP TABLE "website"."pages_blocks_comparison_table_rows_cells" CASCADE;
  DROP TABLE "website"."pages_blocks_comparison_table_rows" CASCADE;
  DROP TABLE "website"."pages_blocks_comparison_table" CASCADE;
  DROP TABLE "website"."pages_blocks_faq_items" CASCADE;
  DROP TABLE "website"."pages_blocks_faq" CASCADE;
  DROP TABLE "website"."pages_blocks_cta_links" CASCADE;
  DROP TABLE "website"."pages_blocks_cta" CASCADE;
  DROP TABLE "website"."pages_blocks_content_columns" CASCADE;
  DROP TABLE "website"."pages_blocks_content" CASCADE;
  DROP TABLE "website"."pages_blocks_media_block" CASCADE;
  DROP TABLE "website"."pages" CASCADE;
  DROP TABLE "website"."_pages_v_version_hero_links" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_feature_grid_items" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_feature_grid" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_feature_showcase_bullets" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_feature_showcase" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_steps_steps" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_steps" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_code_block_tabs" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_code_block" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_product_demo" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_stats_band_items" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_stats_band" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_comparison_table_columns" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_comparison_table_rows_cells" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_comparison_table_rows" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_comparison_table" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_faq_items" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_faq" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_cta_links" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_cta" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_content_columns" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_content" CASCADE;
  DROP TABLE "website"."_pages_v_blocks_media_block" CASCADE;
  DROP TABLE "website"."_pages_v" CASCADE;
  DROP TABLE "website"."media" CASCADE;
  DROP TABLE "website"."users_sessions" CASCADE;
  DROP TABLE "website"."users" CASCADE;
  DROP TABLE "website"."redirects" CASCADE;
  DROP TABLE "website"."redirects_rels" CASCADE;
  DROP TABLE "website"."payload_kv" CASCADE;
  DROP TABLE "website"."payload_jobs_log" CASCADE;
  DROP TABLE "website"."payload_jobs" CASCADE;
  DROP TABLE "website"."payload_locked_documents" CASCADE;
  DROP TABLE "website"."payload_locked_documents_rels" CASCADE;
  DROP TABLE "website"."payload_preferences" CASCADE;
  DROP TABLE "website"."payload_preferences_rels" CASCADE;
  DROP TABLE "website"."payload_migrations" CASCADE;
  DROP TABLE "website"."header_nav_items" CASCADE;
  DROP TABLE "website"."header_ctas" CASCADE;
  DROP TABLE "website"."header" CASCADE;
  DROP TABLE "website"."footer_columns_links" CASCADE;
  DROP TABLE "website"."footer_columns" CASCADE;
  DROP TABLE "website"."footer_legal" CASCADE;
  DROP TABLE "website"."footer_social" CASCADE;
  DROP TABLE "website"."footer" CASCADE;
  DROP TABLE "website"."site_settings" CASCADE;
  DROP TYPE "website"."enum_pages_hero_links_link_type";
  DROP TYPE "website"."enum_pages_hero_links_link_appearance";
  DROP TYPE "website"."enum_pages_blocks_feature_grid_items_icon";
  DROP TYPE "website"."enum_pages_blocks_feature_grid_items_link_type";
  DROP TYPE "website"."enum_pages_blocks_feature_grid_header_align";
  DROP TYPE "website"."enum_pages_blocks_feature_grid_columns";
  DROP TYPE "website"."enum_pages_blocks_feature_grid_settings_background";
  DROP TYPE "website"."enum_pages_blocks_feature_grid_settings_spacing";
  DROP TYPE "website"."enum_pages_blocks_feature_showcase_header_align";
  DROP TYPE "website"."enum_pages_blocks_feature_showcase_media_side";
  DROP TYPE "website"."enum_pages_blocks_feature_showcase_visual_kind";
  DROP TYPE "website"."enum_pages_blocks_feature_showcase_visual_demo";
  DROP TYPE "website"."enum_pages_blocks_feature_showcase_visual_frame";
  DROP TYPE "website"."enum_pages_blocks_feature_showcase_link_type";
  DROP TYPE "website"."enum_pages_blocks_feature_showcase_settings_background";
  DROP TYPE "website"."enum_pages_blocks_feature_showcase_settings_spacing";
  DROP TYPE "website"."enum_pages_blocks_steps_steps_code_language";
  DROP TYPE "website"."enum_pages_blocks_steps_header_align";
  DROP TYPE "website"."enum_pages_blocks_steps_link_type";
  DROP TYPE "website"."enum_pages_blocks_steps_settings_background";
  DROP TYPE "website"."enum_pages_blocks_steps_settings_spacing";
  DROP TYPE "website"."enum_pages_blocks_code_block_tabs_language";
  DROP TYPE "website"."enum_pages_blocks_code_block_header_align";
  DROP TYPE "website"."enum_pages_blocks_code_block_settings_background";
  DROP TYPE "website"."enum_pages_blocks_code_block_settings_spacing";
  DROP TYPE "website"."enum_pages_blocks_product_demo_header_align";
  DROP TYPE "website"."enum_pages_blocks_product_demo_demo";
  DROP TYPE "website"."enum_pages_blocks_product_demo_frame";
  DROP TYPE "website"."enum_pages_blocks_product_demo_settings_background";
  DROP TYPE "website"."enum_pages_blocks_product_demo_settings_spacing";
  DROP TYPE "website"."enum_pages_blocks_stats_band_header_align";
  DROP TYPE "website"."enum_pages_blocks_stats_band_settings_background";
  DROP TYPE "website"."enum_pages_blocks_stats_band_settings_spacing";
  DROP TYPE "website"."enum_pages_blocks_comparison_table_rows_cells_state";
  DROP TYPE "website"."enum_pages_blocks_comparison_table_header_align";
  DROP TYPE "website"."enum_pages_blocks_comparison_table_settings_background";
  DROP TYPE "website"."enum_pages_blocks_comparison_table_settings_spacing";
  DROP TYPE "website"."enum_pages_blocks_faq_header_align";
  DROP TYPE "website"."enum_pages_blocks_faq_settings_background";
  DROP TYPE "website"."enum_pages_blocks_faq_settings_spacing";
  DROP TYPE "website"."enum_pages_blocks_cta_links_link_type";
  DROP TYPE "website"."enum_pages_blocks_cta_links_link_appearance";
  DROP TYPE "website"."enum_pages_blocks_cta_tone";
  DROP TYPE "website"."enum_pages_blocks_cta_settings_background";
  DROP TYPE "website"."enum_pages_blocks_cta_settings_spacing";
  DROP TYPE "website"."enum_pages_blocks_content_columns_width";
  DROP TYPE "website"."enum_pages_blocks_content_settings_background";
  DROP TYPE "website"."enum_pages_blocks_content_settings_spacing";
  DROP TYPE "website"."enum_pages_blocks_media_block_frame";
  DROP TYPE "website"."enum_pages_blocks_media_block_size";
  DROP TYPE "website"."enum_pages_blocks_media_block_settings_background";
  DROP TYPE "website"."enum_pages_blocks_media_block_settings_spacing";
  DROP TYPE "website"."enum_pages_hero_variant";
  DROP TYPE "website"."enum_pages_hero_demo";
  DROP TYPE "website"."enum_pages_hero_snippet_language";
  DROP TYPE "website"."enum_pages_status";
  DROP TYPE "website"."enum__pages_v_version_hero_links_link_type";
  DROP TYPE "website"."enum__pages_v_version_hero_links_link_appearance";
  DROP TYPE "website"."enum__pages_v_blocks_feature_grid_items_icon";
  DROP TYPE "website"."enum__pages_v_blocks_feature_grid_items_link_type";
  DROP TYPE "website"."enum__pages_v_blocks_feature_grid_header_align";
  DROP TYPE "website"."enum__pages_v_blocks_feature_grid_columns";
  DROP TYPE "website"."enum__pages_v_blocks_feature_grid_settings_background";
  DROP TYPE "website"."enum__pages_v_blocks_feature_grid_settings_spacing";
  DROP TYPE "website"."enum__pages_v_blocks_feature_showcase_header_align";
  DROP TYPE "website"."enum__pages_v_blocks_feature_showcase_media_side";
  DROP TYPE "website"."enum__pages_v_blocks_feature_showcase_visual_kind";
  DROP TYPE "website"."enum__pages_v_blocks_feature_showcase_visual_demo";
  DROP TYPE "website"."enum__pages_v_blocks_feature_showcase_visual_frame";
  DROP TYPE "website"."enum__pages_v_blocks_feature_showcase_link_type";
  DROP TYPE "website"."enum__pages_v_blocks_feature_showcase_settings_background";
  DROP TYPE "website"."enum__pages_v_blocks_feature_showcase_settings_spacing";
  DROP TYPE "website"."enum__pages_v_blocks_steps_steps_code_language";
  DROP TYPE "website"."enum__pages_v_blocks_steps_header_align";
  DROP TYPE "website"."enum__pages_v_blocks_steps_link_type";
  DROP TYPE "website"."enum__pages_v_blocks_steps_settings_background";
  DROP TYPE "website"."enum__pages_v_blocks_steps_settings_spacing";
  DROP TYPE "website"."enum__pages_v_blocks_code_block_tabs_language";
  DROP TYPE "website"."enum__pages_v_blocks_code_block_header_align";
  DROP TYPE "website"."enum__pages_v_blocks_code_block_settings_background";
  DROP TYPE "website"."enum__pages_v_blocks_code_block_settings_spacing";
  DROP TYPE "website"."enum__pages_v_blocks_product_demo_header_align";
  DROP TYPE "website"."enum__pages_v_blocks_product_demo_demo";
  DROP TYPE "website"."enum__pages_v_blocks_product_demo_frame";
  DROP TYPE "website"."enum__pages_v_blocks_product_demo_settings_background";
  DROP TYPE "website"."enum__pages_v_blocks_product_demo_settings_spacing";
  DROP TYPE "website"."enum__pages_v_blocks_stats_band_header_align";
  DROP TYPE "website"."enum__pages_v_blocks_stats_band_settings_background";
  DROP TYPE "website"."enum__pages_v_blocks_stats_band_settings_spacing";
  DROP TYPE "website"."enum__pages_v_blocks_comparison_table_rows_cells_state";
  DROP TYPE "website"."enum__pages_v_blocks_comparison_table_header_align";
  DROP TYPE "website"."enum__pages_v_blocks_comparison_table_settings_background";
  DROP TYPE "website"."enum__pages_v_blocks_comparison_table_settings_spacing";
  DROP TYPE "website"."enum__pages_v_blocks_faq_header_align";
  DROP TYPE "website"."enum__pages_v_blocks_faq_settings_background";
  DROP TYPE "website"."enum__pages_v_blocks_faq_settings_spacing";
  DROP TYPE "website"."enum__pages_v_blocks_cta_links_link_type";
  DROP TYPE "website"."enum__pages_v_blocks_cta_links_link_appearance";
  DROP TYPE "website"."enum__pages_v_blocks_cta_tone";
  DROP TYPE "website"."enum__pages_v_blocks_cta_settings_background";
  DROP TYPE "website"."enum__pages_v_blocks_cta_settings_spacing";
  DROP TYPE "website"."enum__pages_v_blocks_content_columns_width";
  DROP TYPE "website"."enum__pages_v_blocks_content_settings_background";
  DROP TYPE "website"."enum__pages_v_blocks_content_settings_spacing";
  DROP TYPE "website"."enum__pages_v_blocks_media_block_frame";
  DROP TYPE "website"."enum__pages_v_blocks_media_block_size";
  DROP TYPE "website"."enum__pages_v_blocks_media_block_settings_background";
  DROP TYPE "website"."enum__pages_v_blocks_media_block_settings_spacing";
  DROP TYPE "website"."enum__pages_v_version_hero_variant";
  DROP TYPE "website"."enum__pages_v_version_hero_demo";
  DROP TYPE "website"."enum__pages_v_version_hero_snippet_language";
  DROP TYPE "website"."enum__pages_v_version_status";
  DROP TYPE "website"."enum_media_theme";
  DROP TYPE "website"."enum_users_role";
  DROP TYPE "website"."enum_redirects_to_type";
  DROP TYPE "website"."enum_payload_jobs_log_task_slug";
  DROP TYPE "website"."enum_payload_jobs_log_state";
  DROP TYPE "website"."enum_payload_jobs_task_slug";
  DROP TYPE "website"."enum_header_nav_items_link_type";
  DROP TYPE "website"."enum_header_ctas_link_type";
  DROP TYPE "website"."enum_header_ctas_link_appearance";
  DROP TYPE "website"."enum_footer_columns_links_link_type";
  DROP TYPE "website"."enum_footer_legal_link_type";
  DROP TYPE "website"."enum_footer_social_platform";
  DROP TYPE "website"."enum_site_settings_announcement_link_type";
  DROP TYPE "website"."enum_site_settings_analytics_provider";`)
  // The schema itself is deliberately left behind: `website.payload_migrations`
  // lives in it, and Payload deletes this migration's row from that table right
  // after `down` returns. Dropping the schema would take the bookkeeping with
  // it. An empty schema costs nothing.
}
