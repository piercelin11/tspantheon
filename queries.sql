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

--計算排名平均、前十名次數、此次平均排名與上次平均排名的差異，並形成表格--
WITH ranking_without_current AS (
    SELECT
        song_name, 
        ranking,
        date_id
    FROM rankings
    JOIN songs ON song_id = songs.id
    JOIN dates ON date_id = dates.id
    WHERE date_id < (SELECT MAX(id) FROM dates)
),
average_ranking_without_current AS (
    SELECT 
        ROW_NUMBER() OVER (ORDER BY AVG(ranking) ASC) AS avr_ranking,
        song_name 
    FROM ranking_without_current
    GROUP BY song_name
),
rankedSongs AS (
    SELECT 
        song_name,
        ranking,
        ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking) AS rn
    FROM 
        songs
    JOIN 
        rankings ON songs.id = song_id 
)

SELECT 
    ROW_NUMBER() OVER (ORDER BY AVG(rankings.ranking) ASC) AS ranking,
    songs.song_name, 
    albums.album_name, 
    AVG(rankings.ranking) AS average_ranking,
    COUNT(rankings.ranking <= 10) AS times_in_top_ten,
    (SELECT avr_ranking FROM average_ranking_without_current WHERE song_name = songs.song_name) AS last_average_ranking,
    (SELECT ranking AS peak FROM rankedSongs WHERE rn = 1 AND song_name = songs.song_name) AS peak
FROM songs
JOIN albums ON albums.id = songs.album_id
JOIN rankings ON songs.id = rankings.song_id
GROUP BY songs.id, songs.song_name, albums.album_name
ORDER BY average_ranking;
