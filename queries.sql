--選取每首歌取排名最高的一次結果--
WITH rankedSongs AS (
    SELECT 
        songs.id,
        song_name,
        album_name,
        ranking,
        date,
        ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking) AS rn
    FROM 
        songs
    JOIN 
        albums ON albums.id = album_id
    JOIN 
        rankings ON songs.id = song_id 
    JOIN 
        dates ON dates.id = date_id
)
SELECT 
    id,
    song_name,
    album_name,
    ranking AS peak,
    date
FROM 
    rankedSongs
WHERE 
    rn = 1;

--選取上一次的歌曲排名結果--
SELECT 
    song_name,
    album_name,
    ranking AS last_ranking
FROM songs
JOIN albums ON albums.id = album_id
JOIN rankings ON songs.id = song_id 
JOIN dates ON dates.id = date_id
WHERE dates.id = (SELECT MAX(id) FROM dates WHERE id < $1)
ORDER BY ranking;


--選取這一次的歌曲排名結果--
SELECT 
    song_name,
    album_name,
    ranking AS current_ranking
FROM songs
JOIN albums ON albums.id = album_id
JOIN rankings ON songs.id = song_id 
JOIN dates ON dates.id = date_id
WHERE dates.id = $1
ORDER BY ranking;

--計算排名平均並形成表格--
SELECT 
    songs.id, 
    song_name, 
    album_name, 
    AVG(ranking) AS average_ranking
FROM songs
JOIN albums ON album_id = albums.id
JOIN rankings ON song_id = songs.id
GROUP BY songs.id, song_name, album_name;