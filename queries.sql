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

--計算排名平均、前十名次數、此次平均排名與上次平均排名的差異、最高排名，並形成表格--
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


--將專輯平均排名、專輯名稱、專輯歌曲平均排名、專輯歌曲平均排名前一百的點數總和、上一次專輯歌曲平均排名前一百的點數總和與上一次平均排名形成表格--
WITH album_chart AS (SELECT DISTINCT ON (song_name)
    album_name, 
    song_name, 
    AVG(ranking) OVER (PARTITION BY song_name) AS song_average_ranking,
	CASE 
		WHEN ROUND(100 - AVG(ranking) OVER (PARTITION BY song_name)) < 0 THEN 0
		ELSE ROUND(100 - AVG(ranking) OVER (PARTITION BY song_name))
	END AS points
FROM albums
JOIN songs ON albums.id = album_id
JOIN rankings ON songs.id = song_id
),
last_album_song_chart AS(SELECT
    album_name,  
	song_name,
	rankings.id AS id,
		CASE WHEN (date_id < (SELECT MAX(date_id) FROM rankings)) THEN 
			CASE 
				WHEN ROUND(100 - AVG(ranking) OVER (PARTITION BY song_name)) < 0 THEN 0
				ELSE ROUND(100 - AVG(ranking) OVER (PARTITION BY song_name))
			END 
		ELSE NULL END AS last_points
FROM albums
JOIN songs ON albums.id = album_id
JOIN rankings ON songs.id = song_id
WHERE date_id < (SELECT MAX(date_id) FROM rankings) OR song_id IN (
    SELECT song_id
    FROM rankings
    GROUP BY song_id
    HAVING COUNT(*) = 1)
), 
last_album_chart AS(SELECT
	album_name,
	song_name,
	last_points
FROM last_album_song_chart
GROUP BY album_name, song_name, last_points
)

SELECT 
	ROW_NUMBER() OVER (ORDER BY SUM(points) DESC) AS ranking,
	album_chart.album_name,
	ROUND(AVG(song_average_ranking)) AS songs_average_ranking,
	SUM(points) AS total_points,
	SUM(last_points) AS total_last_points,
	ROW_NUMBER() OVER (ORDER BY SUM(CASE WHEN last_points IS NOT NULL THEN last_points ELSE 0 END) DESC) AS last_ranking
FROM album_chart
JOIN last_album_chart ON last_album_chart.song_name = album_chart.song_name
GROUP BY album_chart.album_name
