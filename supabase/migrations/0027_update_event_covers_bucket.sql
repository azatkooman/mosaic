UPDATE storage.buckets 
SET file_size_limit = 31457280,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/quicktime'
    ]
WHERE id = 'event-covers';
