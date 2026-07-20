-- Create enums
CREATE TYPE social_platform AS ENUM ('linkedin', 'x', 'instagram', 'tiktok');
CREATE TYPE social_status AS ENUM ('not_found', 'found', 'dead', 'active');
CREATE TYPE outreach_stage AS ENUM ('not_started', 'drafted', 'sent', 'replied', 'meeting', 'dead');

-- Companies table
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  website TEXT,
  yc_batch TEXT,
  one_liner TEXT,
  industry TEXT,
  team_size INT,
  location TEXT,
  is_hiring BOOLEAN DEFAULT false,
  yc_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_companies_yc_batch ON companies(yc_batch);

-- Socials table
CREATE TABLE socials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  url TEXT,
  followers INT,
  last_post_at DATE,
  status social_status DEFAULT 'not_found',
  checked_at TIMESTAMPTZ DEFAULT now()
);

-- Contacts table
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  is_founder BOOLEAN DEFAULT false,
  linkedin_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Scores table
CREATE TABLE scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  presence_gap_score INT,
  fit_score INT,
  total_score INT,
  reasons JSONB,
  scored_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scores_total_score ON scores(total_score DESC);

-- Outreach table
CREATE TABLE outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  stage outreach_stage DEFAULT 'not_started',
  message_text TEXT,
  sent_at TIMESTAMPTZ,
  next_followup_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_outreach_next_followup ON outreach(next_followup_at);

-- Enable Row Level Security on all tables (no policies — service-role key always used)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE socials ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach ENABLE ROW LEVEL SECURITY;
