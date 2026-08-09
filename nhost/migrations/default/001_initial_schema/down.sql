-- Rollback initial schema

DROP TRIGGER IF EXISTS set_workflows_updated_at ON public.workflows;
DROP TRIGGER IF EXISTS set_organizations_updated_at ON public.organizations;
DROP FUNCTION IF EXISTS public.set_updated_at();

DROP VIEW IF EXISTS public.org_usage_stats;

DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.workflow_results CASCADE;
DROP TABLE IF EXISTS public.step_runs CASCADE;
DROP TABLE IF EXISTS public.workflow_runs CASCADE;
DROP TABLE IF EXISTS public.workflow_triggers CASCADE;
DROP TABLE IF EXISTS public.workflow_steps CASCADE;
DROP TABLE IF EXISTS public.workflows CASCADE;
DROP TABLE IF EXISTS public.org_members CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;
