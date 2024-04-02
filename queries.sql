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

--計算排名平均、前十名次數、此次平均排名、最高排名、前十名次數排名、進步退步幅度排名，並形成表格--
WITH ranking_without_current AS (
    SELECT song_name, ranking, date_id 
    FROM rankings 
    JOIN songs ON song_id = songs.id 
    JOIN dates ON date_id = dates.id 
    WHERE date_id < (SELECT MAX(id) FROM dates)
), 
average_ranking_without_current AS (
    SELECT ROW_NUMBER() OVER (ORDER BY AVG(ranking) ASC) AS avr_ranking, song_name 
    FROM ranking_without_current 
    GROUP BY song_name
), 
rankedSongs AS (
    SELECT 
        song_id, 
        song_name, 
        album_name, 
        ranking, 
        date_id, 
        ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking ASC) AS peakrn,
        ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking DESC) AS worstrn,
        LEAD(ranking) OVER (PARTITION BY songs.id ORDER BY date_id) AS next_ranking 
    FROM songs 
    JOIN rankings ON songs.id = song_id 
    JOIN albums ON album_id = albums.id
) 
SELECT 
    songs.id, 
    ROW_NUMBER() OVER (ORDER BY AVG(rankings.ranking) ASC) AS ranking, 
    songs.song_name, 
    rankedSongs.album_name, 
    AVG(rankings.ranking) AS average_ranking, 
    COUNT(CASE WHEN rankings.ranking <= 10 THEN 1 ELSE NULL END) AS times_in_top_ten, 
    (SELECT avr_ranking FROM average_ranking_without_current WHERE song_name = songs.song_name) AS last_average_ranking, 
    (SELECT ranking AS peak FROM rankedSongs WHERE peakrn = 1 AND song_name = songs.song_name) AS peak, 
    SUM(ABS(next_ranking - rankings.ranking)) AS total_score_difference, 
    RANK () OVER (ORDER BY (COUNT(CASE WHEN rankings.ranking <= 10 THEN 1 ELSE NULL END)) DESC) AS top_ten_award, 
    RANK () OVER (ORDER BY CASE WHEN SUM(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN SUM(ABS(next_ranking - rankings.ranking)) ELSE 0 END DESC) AS most_difference_award, 
    RANK () OVER (ORDER BY CASE WHEN SUM(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN SUM(ABS(next_ranking - rankings.ranking)) ELSE 1000 END ASC) AS most_stable_award,
	RANK () OVER(ORDER BY (SELECT ranking FROM rankedSongs WHERE worstrn = 1 AND song_name = songs.song_name) - (SELECT ranking FROM rankedSongs WHERE peakrn = 1 AND song_name = songs.song_name) DESC) AS gap_award
FROM 
    rankings 
JOIN 
    rankedSongs ON rankedSongs.song_id = rankings.song_id AND rankedSongs.date_id = rankings.date_id 
JOIN 
    songs ON songs.id = rankings.song_id 
GROUP BY 
    songs.id, songs.song_name, rankedSongs.album_name 
ORDER BY 
    average_ranking


--用於專輯平均排名頁面，將專輯平均排名、專輯名稱、專輯歌曲平均排名、專輯歌曲平均排名前一百的點數總和、上一次專輯歌曲平均排名前一百的點數總和與上一次平均排名形成表格--
WITH album_chart AS (SELECT DISTINCT ON (song_name)
    albums.id AS id,
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
    album_chart.id AS id,
	ROW_NUMBER() OVER (ORDER BY SUM(points) DESC) AS ranking,
	album_chart.album_name,
	ROUND(AVG(song_average_ranking)) AS songs_average_ranking,
	SUM(points) AS total_points,
	SUM(last_points) AS total_last_points,
	ROW_NUMBER() OVER (ORDER BY SUM(CASE WHEN last_points IS NOT NULL THEN last_points ELSE 0 END) DESC) AS last_ranking
FROM album_chart
JOIN last_album_chart ON last_album_chart.song_name = album_chart.song_name
GROUP BY id, album_chart.album_name

--用於歌曲資訊頁面與歌曲平均排名頁面，獲得全部歌曲的前十次數排名、進步退步總幅度最大排名等資料--
WITH rankedSongs AS (
    SELECT 
		song_id,
        song_name,
		album_name,
        ranking,
		date_id,
        ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking ASC) AS peakrn,
		ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking DESC) AS worstrn,
		LEAD(ranking) OVER (PARTITION BY songs.id ORDER BY date_id) AS next_ranking
    FROM 
        songs
    JOIN 
        rankings ON songs.id = song_id 
	JOIN albums ON album_id = albums.id
)

SELECT 
	songs.id AS id, 
    ROW_NUMBER() OVER (ORDER BY AVG(rankings.ranking) ASC) AS ranking,
    songs.song_name, 
	rankedSongs.album_name,
    AVG(rankings.ranking) AS average_ranking,
    COUNT(CASE WHEN rankings.ranking <= 10 THEN 1 ELSE NULL END) AS times_in_top_ten,
    (SELECT ranking FROM rankedSongs WHERE peakrn = 1 AND song_name = songs.song_name) AS peak,
	(SELECT ranking FROM rankedSongs WHERE worstrn = 1 AND song_name = songs.song_name) AS worst,
	SUM(ABS(next_ranking - rankings.ranking)) AS total_score_difference,
    RANK () OVER (ORDER BY (COUNT(CASE WHEN rankings.ranking <= 10 THEN 1 ELSE NULL END)) DESC) AS top_ten_award,
	RANK () OVER (ORDER BY CASE WHEN SUM(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN SUM(ABS(next_ranking - rankings.ranking)) ELSE 0 END DESC) AS most_difference_award,
	RANK () OVER(ORDER BY (SELECT ranking FROM rankedSongs WHERE worstrn = 1 AND song_name = songs.song_name) - (SELECT ranking FROM rankedSongs WHERE peakrn = 1 AND song_name = songs.song_name) DESC) AS gap_award
FROM rankings
JOIN rankedSongs ON rankedSongs.song_id = rankings.song_id AND rankedSongs.date_id = rankings.date_id
JOIN songs ON songs.id = rankings.song_id
GROUP BY songs.id, songs.song_name, rankedSongs.album_name
ORDER BY average_ranking;

-- 用於專輯資訊頁面，獲得專輯獲得的總獎項數、在平均歌排名前十前五十前一百的歌數量、專輯中歌曲總平均排名與點數 --
WITH rankedSongs AS (
    SELECT 
        song_id, 
		album_id,
        song_name, 
        album_name,
        ranking, 
        date_id, 
        ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking ASC) AS peakrn,
        ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking DESC) AS worstrn,
        LEAD(ranking) OVER (PARTITION BY songs.id ORDER BY date_id) AS next_ranking 
    FROM songs 
    JOIN rankings ON songs.id = song_id 
    JOIN albums ON album_id = albums.id
), rankedSongs2 AS (
	SELECT 
		rankedSongs.album_id AS id,
		songs.id AS song_id, 
		ROW_NUMBER() OVER (ORDER BY AVG(rankings.ranking) ASC) AS ranking, 
		songs.song_name, 
		rankedSongs.album_name, 
		AVG(rankings.ranking) AS average_ranking, 
		RANK () OVER (ORDER BY (COUNT(CASE WHEN rankings.ranking <= 10 THEN 1 ELSE NULL END)) DESC) AS top_ten_award,
		COUNT (CASE WHEN rankings.ranking = 1 THEN 1 ELSE NULL END) AS top_one_award,
		RANK () OVER (ORDER BY CASE WHEN SUM(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN SUM(ABS(next_ranking - rankings.ranking)) ELSE 0 END DESC) AS soaring_award, 
		RANK () OVER (ORDER BY CASE WHEN SUM(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN SUM(ABS(next_ranking - rankings.ranking)) ELSE 1000 END ASC) AS anchored_award,
		RANK () OVER(ORDER BY (SELECT ranking FROM rankedSongs WHERE worstrn = 1 AND song_name = songs.song_name) - (SELECT ranking FROM rankedSongs WHERE peakrn = 1 AND song_name = songs.song_name) DESC) AS gap_award
	FROM 
		rankings 
	JOIN 
		rankedSongs ON rankedSongs.song_id = rankings.song_id AND rankedSongs.date_id = rankings.date_id 
	JOIN 
		songs ON songs.id = rankings.song_id 
	GROUP BY 
		songs.id, songs.song_name, rankedSongs.album_name, rankedSongs.album_id
)

SELECT 
	id,
	album_name,
	ROUND(AVG(average_ranking)) AS songs_avr_ranking,
	COUNT (CASE WHEN top_ten_award <= 5 THEN 1 ELSE null END) AS count_top_ten_award,
	COUNT (CASE WHEN anchored_award <= 5 THEN 1 ELSE null END) AS count_anchored_award,
	COUNT (CASE WHEN soaring_award <= 5 THEN 1 ELSE null END) AS count_soaring_award,
	COUNT (CASE WHEN gap_award <= 5 THEN 1 ELSE null END) AS count_gap_award,
	SUM(top_one_award) AS count_top_one_award,
	COUNT (CASE WHEN ranking <= 10 THEN 1 ELSE null END) AS songs_in_10,
	COUNT (CASE WHEN ranking <= 50 THEN 1 ELSE null END) AS songs_in_50,
	COUNT (CASE WHEN ranking <= 100 THEN 1 ELSE null END) AS songs_in_100,
	SUM(
		CASE 
			WHEN ROUND(100 - average_ranking) < 0 THEN 0
			ELSE ROUND(100 - average_ranking)
		END
	) AS total_points
FROM rankedSongs2
WHERE id = $1
GROUP BY id, album_name

-- 專輯資訊頁面的所有歌曲紀錄 --
WITH rankedSongs AS (
    SELECT 
        song_id, 
		album_id,
        song_name, 
        album_name, 
        ranking, 
        date_id, 
        ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking ASC) AS peakrn,
        ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking DESC) AS worstrn,
        LEAD(ranking) OVER (PARTITION BY songs.id ORDER BY date_id) AS next_ranking 
    FROM songs 
    JOIN rankings ON songs.id = song_id 
    JOIN albums ON album_id = albums.id
), rankedSongs2 AS (
	SELECT 
		rankedSongs.album_id AS id,
		songs.id AS song_id, 
		ROW_NUMBER() OVER (ORDER BY AVG(rankings.ranking) ASC) AS ranking, 
		songs.song_name, 
		rankedSongs.album_name, 
		AVG(rankings.ranking) AS average_ranking, 
		RANK () OVER (ORDER BY (COUNT(CASE WHEN rankings.ranking <= 10 THEN 1 ELSE NULL END)) DESC) AS top_ten_award,
		COUNT (CASE WHEN rankings.ranking = 1 THEN 1 ELSE NULL END) AS top_one_award,
		RANK () OVER (ORDER BY CASE WHEN SUM(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN SUM(ABS(next_ranking - rankings.ranking)) ELSE 0 END DESC) AS soaring_award, 
		RANK () OVER (ORDER BY CASE WHEN SUM(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN SUM(ABS(next_ranking - rankings.ranking)) ELSE 1000 END ASC) AS anchored_award,
		RANK () OVER(ORDER BY (SELECT ranking FROM rankedSongs WHERE worstrn = 1 AND song_name = songs.song_name) - (SELECT ranking FROM rankedSongs WHERE peakrn = 1 AND song_name = songs.song_name) DESC) AS gap_award
	FROM 
		rankings 
	JOIN 
		rankedSongs ON rankedSongs.song_id = rankings.song_id AND rankedSongs.date_id = rankings.date_id 
	JOIN 
		songs ON songs.id = rankings.song_id 
	GROUP BY 
		songs.id, songs.song_name, rankedSongs.album_name, rankedSongs.album_id
)

SELECT 
	id,
	song_id,
	ranking,
	song_name,
	top_ten_award,
	top_one_award,
	soaring_award,
	anchored_award,
	gap_award
FROM rankedSongs2
WHERE id = $1
ORDER BY ranking
