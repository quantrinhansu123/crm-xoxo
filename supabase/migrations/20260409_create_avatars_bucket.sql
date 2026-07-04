-- Create avatars bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop old policies if exist
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;

-- Allow anyone to upload to avatars bucket
CREATE POLICY "Allow upload to avatars"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'avatars');

-- Allow anyone to update avatars
CREATE POLICY "Allow update avatars"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'avatars');

-- Allow anyone to read avatars (public)
CREATE POLICY "Allow read avatars"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'avatars');

-- Allow delete avatars
CREATE POLICY "Allow delete avatars"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'avatars');
