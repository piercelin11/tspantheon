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
    const dates = await getDates();
    res.render("songs-ranking.ejs", { allDates: dates });
})

//不同日期排名紀錄的動態路由
app.get("/songs-ranking/:id", async (req, res) => {
    const CurrentDateId = parseInt(req.params.id);
    const dates = await getDates();
    const date = await getDates(CurrentDateId);
    try {
        const mostRecentDate = await db.query("SELECT MAX(id) FROM dates");
        const mostRecentDateId = mostRecentDate.rows[0].max;
        //讀取歌曲的此次排名、上次排名、與最高排名
        const currentRankings = await db.query("SELECT song_name, album_name, ranking AS current_ranking FROM songs JOIN albums ON albums.id = album_id JOIN rankings ON songs.id = song_id JOIN dates ON dates.id = date_id WHERE dates.id = $1 ORDER BY ranking", [CurrentDateId]);
        const peaks = await db.query("WITH rankedSongs AS (SELECT songs.id, song_name, album_name, ranking, date, ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking) AS rn FROM songs JOIN albums ON albums.id = album_id JOIN rankings ON songs.id = song_id JOIN dates ON dates.id = date_id) SELECT song_name, ranking AS peak FROM rankedSongs WHERE rn = 1");
        const lastRankings = await db.query("SELECT song_name, ranking AS last_ranking FROM songs JOIN albums ON albums.id = album_id JOIN rankings ON songs.id = song_id JOIN dates ON dates.id = date_id WHERE dates.id = (SELECT MAX(id) FROM dates WHERE id < $1) ORDER BY ranking", [CurrentDateId]);
        
        //合併三個陣列
        const chartData = currentRankings.rows.map( songData => ({
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
app.get("/average-songs-ranking", async (req, res) => {
    try {
        const result = await db.query("WITH ranking_without_current AS (SELECT song_name, ranking, date_id FROM rankings JOIN songs ON song_id = songs.id JOIN dates ON date_id = dates.id WHERE date_id < (SELECT MAX(id) FROM dates)), average_ranking_without_current AS (SELECT ROW_NUMBER() OVER (ORDER BY AVG(ranking) ASC) AS avr_ranking, song_name FROM ranking_without_current GROUP BY song_name), rankedSongs AS (SELECT song_name, ranking, ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking) AS rn FROM songs JOIN rankings ON songs.id = song_id ) SELECT ROW_NUMBER() OVER (ORDER BY AVG(rankings.ranking) ASC) AS ranking, songs.song_name, albums.album_name, AVG(rankings.ranking) AS average_ranking, COUNT(rankings.ranking <= 10) AS times_in_top_ten, (SELECT avr_ranking FROM average_ranking_without_current WHERE song_name = songs.song_name) AS last_average_ranking, (SELECT ranking AS peak FROM rankedSongs WHERE rn = 1 AND song_name = songs.song_name) AS peak FROM songs JOIN albums ON albums.id = songs.album_id JOIN rankings ON songs.id = rankings.song_id GROUP BY songs.id, songs.song_name, albums.album_name ORDER BY average_ranking");
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

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

