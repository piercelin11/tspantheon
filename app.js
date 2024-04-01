import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
const port = 3000;

const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "taylor swift",
    password: "pierce8811",
    port: 5432
});
db.connect();

app.set("view engine", "ejs");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

//更改日期的格式
function alterDateFormat(date){
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");

    const formattedDate = `${year}.${month}.${day}`;
    return formattedDate;
}

//從dates資料庫讀取日期資訊
async function getDates(dateId){
    if (!dateId){
        try {
            const result = await db.query("SELECT * FROM dates ORDER BY id DESC"); 
            const dates = result.rows.map(item => ({
                id: item.id,
                date: alterDateFormat(item.date),
                info: item.info
            }));
            return dates;
        } catch (err) {
            console.log(err);
        } 
    } else {
        try {
            const result = await db.query("SELECT * FROM dates WHERE id = $1", [dateId]); 
            const dates = result.rows.map(item => ({
                id: item.id,
                date: alterDateFormat(item.date),
                info: item.info
            }));
            return dates;
        } catch (err) {
            console.log(err);
        } 
    }
    
}

app.get("/", async (req, res) => {
    res.render("song-info.ejs");
})

//不同日期排名紀錄的動態路由
app.get("/songs-ranking/date/:id", async (req, res) => {
    const CurrentDateId = parseInt(req.params.id);
    const dates = await getDates();
    const date = await getDates(CurrentDateId);
    try {
        const mostRecentDate = await db.query("SELECT MAX(id) FROM dates");
        const mostRecentDateId = mostRecentDate.rows[0].max;
        //讀取歌曲的此次排名、上次排名、與最高排名
        const currentRankings = await db.query("SELECT songs.id, song_name, album_name, ranking AS current_ranking FROM songs JOIN albums ON albums.id = album_id JOIN rankings ON songs.id = song_id JOIN dates ON dates.id = date_id WHERE dates.id = $1 ORDER BY ranking", [CurrentDateId]);
        const peaks = await db.query("WITH rankedSongs AS (SELECT songs.id, song_name, album_name, ranking, date, ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking) AS rn FROM songs JOIN albums ON albums.id = album_id JOIN rankings ON songs.id = song_id JOIN dates ON dates.id = date_id) SELECT song_name, ranking AS peak FROM rankedSongs WHERE rn = 1");
        const lastRankings = await db.query("SELECT song_name, ranking AS last_ranking FROM songs JOIN albums ON albums.id = album_id JOIN rankings ON songs.id = song_id JOIN dates ON dates.id = date_id WHERE dates.id = (SELECT MAX(id) FROM dates WHERE id < $1) ORDER BY ranking", [CurrentDateId]);
        
        //合併三個陣列
        const chartData = currentRankings.rows.map( songData => ({
            id: songData.id,
            songName: songData.song_name,
            albumName: songData.album_name,
            currentRanking: songData.current_ranking,
            //是否為最新的歌曲排名，是則顯示不是則不顯示
            lastRanking: lastRankings.rows.length !== 0 ? (lastRankings.rows.find( item => item.song_name === songData.song_name )?.last_ranking ?? "") : "",
            //是否為最新的歌曲排名，是則顯示peak不是則不顯示peak
            peak: peaks.rows.find( item => item.song_name === songData.song_name ).peak,
            difference: lastRankings.rows.length === 0 ? "" : (lastRankings.rows.find( item => item.song_name === songData.song_name )?.last_ranking - songData.current_ranking ?? ""),
        }));

        res.render("songs-ranking.ejs", { 
            allDates: dates, 
            currentDate: date[0], 
            chartData: chartData,
            isCurrent: mostRecentDateId === CurrentDateId ? true : false,
        });
        
    } catch (err) {
        console.log(err);
    }   
});

//歌曲平均排名頁面
app.get("/songs-ranking", async (req, res) => {
    try {
        const result = await db.query("WITH ranking_without_current AS (SELECT song_name, ranking, date_id FROM rankings JOIN songs ON song_id = songs.id JOIN dates ON date_id = dates.id WHERE date_id < (SELECT MAX(id) FROM dates)), average_ranking_without_current AS (SELECT ROW_NUMBER() OVER (ORDER BY AVG(ranking) ASC) AS avr_ranking, song_name FROM ranking_without_current GROUP BY song_name), rankedSongs AS (SELECT song_id, song_name, album_name, ranking, date_id, ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking ASC) AS peakrn, ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking DESC) AS worstrn, LEAD(ranking) OVER (PARTITION BY songs.id ORDER BY date_id) AS next_ranking FROM songs JOIN rankings ON songs.id = song_id JOIN albums ON album_id = albums.id) SELECT songs.id, ROW_NUMBER() OVER (ORDER BY AVG(rankings.ranking) ASC) AS ranking, songs.song_name, rankedSongs.album_name, AVG(rankings.ranking) AS average_ranking, COUNT(CASE WHEN rankings.ranking <= 10 THEN 1 ELSE NULL END) AS times_in_top_ten, (SELECT avr_ranking FROM average_ranking_without_current WHERE song_name = songs.song_name) AS last_average_ranking, (SELECT ranking AS peak FROM rankedSongs WHERE peakrn = 1 AND song_name = songs.song_name) AS peak, SUM(ABS(next_ranking - rankings.ranking)) AS total_score_difference, RANK () OVER (ORDER BY (COUNT(CASE WHEN rankings.ranking <= 10 THEN 1 ELSE NULL END)) DESC) AS top_ten_award, RANK () OVER (ORDER BY CASE WHEN SUM(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN SUM(ABS(next_ranking - rankings.ranking)) ELSE 0 END DESC) AS most_difference_award, RANK () OVER (ORDER BY CASE WHEN SUM(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN SUM(ABS(next_ranking - rankings.ranking)) ELSE 0 END ASC) AS most_stable_award FROM rankings JOIN rankedSongs ON rankedSongs.song_id = rankings.song_id AND rankedSongs.date_id = rankings.date_id JOIN songs ON songs.id = rankings.song_id GROUP BY songs.id, songs.song_name, rankedSongs.album_name ORDER BY average_ranking");
        console.log(result.rows);
        res.render("average-songs-ranking.ejs", { averageChartData: result.rows });        
    } catch (err) {
        console.log(err);
    } 
});
 
//專輯平均排名頁面
app.get("/albums-ranking", async (req, res) => {
    try {
        const result = await db.query("WITH album_chart AS (SELECT DISTINCT ON (song_name) album_name, song_name, AVG(ranking) OVER (PARTITION BY song_name) AS song_average_ranking, CASE WHEN ROUND(100 - AVG(ranking) OVER (PARTITION BY song_name)) < 0 THEN 0 ELSE ROUND(100 - AVG(ranking) OVER (PARTITION BY song_name)) END AS points FROM albums JOIN songs ON albums.id = album_id JOIN rankings ON songs.id = song_id ), last_album_song_chart AS(SELECT album_name,  song_name, rankings.id AS id, CASE WHEN (date_id < (SELECT MAX(date_id) FROM rankings)) THEN CASE WHEN ROUND(100 - AVG(ranking) OVER (PARTITION BY song_name)) < 0 THEN 0 ELSE ROUND(100 - AVG(ranking) OVER (PARTITION BY song_name)) END ELSE NULL END AS last_points FROM albums JOIN songs ON albums.id = album_id JOIN rankings ON songs.id = song_id WHERE date_id < (SELECT MAX(date_id) FROM rankings) OR song_id IN ( SELECT song_id FROM rankings GROUP BY song_id HAVING COUNT(*) = 1) ), last_album_chart AS(SELECT album_name, song_name, last_points FROM last_album_song_chart GROUP BY album_name, song_name, last_points ) SELECT ROW_NUMBER() OVER (ORDER BY SUM(points) DESC) AS ranking, album_chart.album_name, ROUND(AVG(song_average_ranking)) AS songs_average_ranking, SUM(points) AS total_points, SUM(last_points) AS total_last_points, ROW_NUMBER() OVER (ORDER BY SUM(CASE WHEN last_points IS NOT NULL THEN last_points ELSE 0 END) DESC) AS last_ranking FROM album_chart JOIN last_album_chart ON last_album_chart.song_name = album_chart.song_name GROUP BY album_chart.album_name");
        res.render("album-ranking.ejs", { chartData:  result.rows });
    } catch (err) {
        console.log(err);
    }
    
});

//單首歌曲資訊頁面
app.get("/songs-ranking/song/:song", async (req, res) => {
    const songId = req.params.song;
    try {
        const songStatics = await db.query("WITH rankedSongs AS (SELECT song_id, song_name, album_name, ranking, date_id, ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking ASC) AS peakrn, ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking DESC) AS worstrn, LEAD(ranking) OVER (PARTITION BY songs.id ORDER BY date_id) AS next_ranking FROM songs JOIN rankings ON songs.id = song_id JOIN albums ON album_id = albums.id), songsStatics AS (SELECT songs.id, ROW_NUMBER() OVER (ORDER BY AVG(rankings.ranking) ASC) AS ranking, songs.song_name, rankedSongs.album_name, AVG(rankings.ranking) AS average_ranking, COUNT(CASE WHEN rankings.ranking <= 10 THEN 1 ELSE NULL END) AS times_in_top_ten, (SELECT ranking FROM rankedSongs WHERE peakrn = 1 AND song_name = songs.song_name) AS peak, (SELECT ranking FROM rankedSongs WHERE worstrn = 1 AND song_name = songs.song_name) AS worst, SUM(ABS(next_ranking - rankings.ranking)) AS total_score_difference, RANK() OVER (ORDER BY (COUNT(CASE WHEN rankings.ranking <= 10 THEN 1 ELSE NULL END)) DESC) AS top_ten_award, RANK() OVER (ORDER BY CASE WHEN SUM(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN SUM(ABS(next_ranking - rankings.ranking)) ELSE 0 END DESC) AS most_difference_award, RANK () OVER (ORDER BY CASE WHEN SUM(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN SUM(ABS(next_ranking - rankings.ranking)) ELSE 0 END ASC) AS most_stable_award FROM rankings JOIN rankedSongs ON rankedSongs.song_id = rankings.song_id AND rankedSongs.date_id = rankings.date_id JOIN songs ON songs.id = rankings.song_id GROUP BY songs.id, songs.song_name, rankedSongs.album_name ORDER BY average_ranking) SELECT * FROM songsStatics WHERE id = $1", [songId]);
        const songHistory = await db.query("SELECT date_id, song_id, song_name, ranking, date, info FROM rankings JOIN songs ON song_id = songs.id JOIN dates ON date_id = dates.id WHERE song_id = $1 ORDER BY date_id", [songId]);
        const albumColor = await db.query("SELECT album_color FROM songs JOIN albums ON album_id = albums.id WHERE songs.id = $1", [songId]);

        const staticsData = songStatics.rows[0];
        const historyData = songHistory.rows;

        const lineChartDateData = historyData.map( item => alterDateFormat(item.date) );
        const lineChartRankingData = historyData.map( item => item.ranking );

        const maxNumber = Math.max(...lineChartRankingData) <= 50 ? 50 :
                          Math.max(...lineChartRankingData) <= 100 ? 100 :
                          Math.max(...lineChartRankingData) <= 150 ? 150 :
                          Math.max(...lineChartRankingData) <= 200 ? 200 :
                          Math.max(...lineChartRankingData) <= 250 ? 250 :
                          300;

        console.log(historyData);
        res.render("song-info.ejs", { 
            statics: staticsData, 
            history: historyData.map( item => ({
                ranking: item.ranking,
                date: alterDateFormat(item.date),
                info: item.info
            })),
            dateData: lineChartDateData, 
            rankingData: lineChartRankingData, 
            albumColor: albumColor.rows[0].album_color !== null ? albumColor.rows[0].album_color : "#32804E", 
            maxNumber: maxNumber });
    } catch (err) {
        console.log(err);
    }   
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

