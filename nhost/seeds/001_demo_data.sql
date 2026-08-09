-- ============================================================
-- Seed Data: 2 Orgs, Users, Roles, Demo Workflow
-- ============================================================
-- NOTE: Users are created via Nhost Auth API (not direct SQL insert into auth.users).
-- This seed creates the org/workflow data. Users must be registered first via the 
-- signup flow or the auth API, then their UUIDs inserted here.
--
-- For local development, use the setup script (scripts/seed.ts) which:
-- 1. Creates users via Nhost Auth
-- 2. Inserts this seed data with the correct user UUIDs

-- ============================================================
-- Organizations
-- ============================================================

INSERT INTO public.organizations (id, name, slug, quota_limit, quota_used)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Acme Corp', 'acme-corp', 100, 0),
    ('b0000000-0000-0000-0000-000000000002', 'Globex Inc', 'globex-inc', 50, 0)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Org Members (user UUIDs will be filled by seed script)
-- Placeholder structure showing role assignments:
--
-- Acme Corp (Org A):
--   alice@acme.com    → owner
--   bob@acme.com      → editor
--   charlie@acme.com  → viewer
--
-- Globex Inc (Org B):
--   dave@globex.com   → owner
--   eve@globex.com    → editor
-- ============================================================

-- ============================================================
-- Demo Workflow for Org A (Acme Corp)
-- A workflow with: llm_call → conditional_branch → http_request → approval_gate → db_write
-- ============================================================

INSERT INTO public.workflows (id, org_id, name, description, is_active)
VALUES (
    'w0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'AI Content Pipeline',
    'Generates content via LLM, checks quality, fetches related data, requires approval, then saves result.',
    true
) ON CONFLICT (id) DO NOTHING;

-- Steps
INSERT INTO public.workflow_steps (id, workflow_id, step_order, step_type, config) VALUES
(
    's0000000-0000-0000-0000-000000000001',
    'w0000000-0000-0000-0000-000000000001',
    1,
    'llm_call',
    '{"model": "gemini-3.6-flash", "prompt": "Generate a short professional summary about AI workflow automation in 2-3 sentences. Respond with JSON: {\"summary\": \"...\", \"quality_score\": 0.0-1.0}", "system_prompt": "You are a helpful assistant that always responds in valid JSON.", "temperature": 0.7}'
),
(
    's0000000-0000-0000-0000-000000000002',
    'w0000000-0000-0000-0000-000000000001',
    2,
    'conditional_branch',
    '{"condition": "output.quality_score >= 0.5", "true_label": "High quality - continue", "false_label": "Low quality - skip http_request"}'
),
(
    's0000000-0000-0000-0000-000000000003',
    'w0000000-0000-0000-0000-000000000001',
    3,
    'http_request',
    '{"url": "https://httpbin.org/post", "method": "POST", "headers": {"Content-Type": "application/json"}, "body_template": "{\"summary\": \"{{previous_output.summary}}\"}"}'
),
(
    's0000000-0000-0000-0000-000000000004',
    'w0000000-0000-0000-0000-000000000001',
    4,
    'approval_gate',
    '{"message": "Please review the AI-generated content and API response before saving.", "required_role": "editor"}'
),
(
    's0000000-0000-0000-0000-000000000005',
    'w0000000-0000-0000-0000-000000000001',
    5,
    'db_write',
    '{"result_key": "ai_content_result", "description": "Save the final approved AI content"}'
)
ON CONFLICT (id) DO NOTHING;

-- Triggers: manual + webhook
INSERT INTO public.workflow_triggers (id, workflow_id, trigger_type, config, is_active) VALUES
(
    't0000000-0000-0000-0000-000000000001',
    'w0000000-0000-0000-0000-000000000001',
    'manual',
    '{}',
    true
),
(
    't0000000-0000-0000-0000-000000000002',
    'w0000000-0000-0000-0000-000000000001',
    'webhook',
    '{"description": "External CI/CD trigger"}',
    true
    -- webhook_secret will be set by the seed script via bcrypt
)
ON CONFLICT (id) DO NOTHING;
