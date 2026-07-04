-- Create job_titles table (Chức danh)
CREATE TABLE IF NOT EXISTS job_titles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active', -- active, inactive
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add trigger for updated_at
CREATE TRIGGER update_job_titles_updated_at
    BEFORE UPDATE ON job_titles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add job_title_id to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title_id UUID REFERENCES job_titles(id);

-- Create index
CREATE INDEX IF NOT EXISTS idx_job_titles_status ON job_titles(status);
CREATE INDEX IF NOT EXISTS idx_users_job_title_id ON users(job_title_id);
