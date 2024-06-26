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

app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public", {
    mimeTypes: {
        "js": "application/javascript"
    }
}));

//更改日期的格式
function alterDateFormat(date){
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");

    const formattedDate = `${year}.${month}.${day}`;
    return formattedDate;
}

function alterDateFormatToLong(date){
    const originalDate = new Date(date);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = originalDate.toLocaleDateString('en-US', options);
    return formattedDate
}

//從dates資料庫讀取日期資訊
async function getDates(dateId){
    if (!dateId){
        try {
            const result = await db.query("SELECT * FROM dates ORDER BY id DESC"); 
            const dates = result.rows.map(item => ({
                id: item.id,
                numericDate: alterDateFormat(item.date),
                longDate: alterDateFormatToLong(item.date),
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
                numericDate: alterDateFormat(item.date),
                longDate: alterDateFormatToLong(item.date),
                info: item.info
            }));
            return dates;
        } catch (err) {
            console.log(err);
        } 
    }
    
}

app.get("/", async (req, res) => {
    
})

//不同日期排名紀錄的動態路由
app.get("/songs-ranking/date/:id", async (req, res) => {
    const currentDateId = parseInt(req.params.id);
    const dates = await getDates();
    const date = await getDates(currentDateId);
    try {
        const mostRecentDate = await db.query("SELECT MAX(id) FROM dates");
        const mostRecentDateId = mostRecentDate.rows[0].max;
        //讀取歌曲的此次排名、上次排名、與最高排名
        const currentRankings = await db.query("SELECT songs.id, song_name, album_name, ranking AS current_ranking FROM songs JOIN albums ON albums.id = album_id JOIN rankings ON songs.id = song_id JOIN dates ON dates.id = date_id WHERE dates.id = $1 ORDER BY ranking", [currentDateId]);
        const peaks = await db.query("WITH rankedSongs AS (SELECT songs.id, song_name, album_name, ranking, date, ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking) AS rn FROM songs JOIN albums ON albums.id = album_id JOIN rankings ON songs.id = song_id JOIN dates ON dates.id = date_id) SELECT song_name, ranking AS peak FROM rankedSongs WHERE rn = 1");
        const lastRankings = await db.query("SELECT song_name, ranking AS last_ranking FROM songs JOIN albums ON albums.id = album_id JOIN rankings ON songs.id = song_id JOIN dates ON dates.id = date_id WHERE dates.id = (SELECT MAX(id) FROM dates WHERE id < $1) ORDER BY ranking", [currentDateId]);
        
        //為圖表需要資料
        const polarChart = await db.query("WITH rankedSongs AS (SELECT song_id, album_id, album_name, album_color, ranking, date_id FROM songs JOIN rankings ON songs.id = song_id JOIN albums ON album_id = albums.id WHERE date_id = $1), rankedSongs2 AS (SELECT rankedSongs.album_id AS id, album_color, rankings.ranking, rankedSongs.album_name FROM rankings JOIN rankedSongs ON rankedSongs.song_id = rankings.song_id AND rankedSongs.date_id = rankings.date_id JOIN songs ON songs.id = rankings.song_id GROUP BY rankedSongs.album_name, rankedSongs.album_id, album_color, rankings.ranking) SELECT id, album_name, album_color, COUNT (CASE WHEN ranking <= (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ranking) FROM rankings) THEN 1 ELSE null END) AS s_in_top_50_percent FROM rankedSongs2 WHERE id != 0 GROUP BY id, album_name, album_color ORDER BY id", [currentDateId]);
        const albumRanking = await db.query("WITH album_chart AS (SELECT DISTINCT ON (song_name) albums.id AS id, album_name, album_color, CASE WHEN ROUND(((SELECT COUNT(DISTINCT song_id) FROM rankings) / 2) - AVG(ranking) OVER (PARTITION BY song_name)) < 0 THEN 0 ELSE ROUND(((SELECT COUNT(DISTINCT song_id) FROM rankings) / 2) - AVG(ranking) OVER (PARTITION BY song_name)) END AS points FROM albums JOIN songs ON albums.id = album_id JOIN rankings ON songs.id = song_id WHERE date_id = $1) SELECT album_chart.id AS id, ROW_NUMBER() OVER (ORDER BY SUM(points) DESC) AS ranking, album_chart.album_name, album_chart.album_color, SUM(points) AS total_points FROM album_chart WHERE id != 0 GROUP BY id, album_chart.album_name, album_chart.album_color ORDER BY ranking", [currentDateId]);

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
            isCurrent: mostRecentDateId === currentDateId ? true : false,
            polarChartsAlbumName: polarChart.rows.map(item => item.album_name),
            polarChartsData: polarChart.rows.map(item => item.s_in_top_50_percent),
            polarChartsColor: polarChart.rows.map(item => (item.album_color + "99")),
            albumRanking: albumRanking.rows
        });
        
    } catch (err) {
        console.log(err);
    }   
});

//歌曲平均排名頁面
app.get("/songs-ranking", async (req, res) => {
    const dates = await getDates();
    try {
        const rankings = await db.query("WITH ranking_without_current AS (SELECT song_name, ranking, date_id FROM rankings JOIN songs ON song_id = songs.id JOIN dates ON date_id = dates.id WHERE date_id < (SELECT MAX(id) FROM dates)), average_ranking_without_current AS (SELECT ROW_NUMBER() OVER (ORDER BY AVG(ranking) ASC) AS avr_ranking, song_name FROM ranking_without_current GROUP BY song_name), rankedSongs AS (SELECT song_id, song_name, album_name, ranking, date_id, ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking ASC) AS peakrn, ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking DESC) AS worstrn, LEAD(ranking) OVER (PARTITION BY songs.id ORDER BY date_id) AS next_ranking FROM songs JOIN rankings ON songs.id = song_id JOIN albums ON album_id = albums.id) SELECT songs.id, ROW_NUMBER() OVER (ORDER BY AVG(rankings.ranking) ASC) AS ranking, songs.song_name, rankedSongs.album_name, AVG(rankings.ranking) AS average_ranking, COUNT(CASE WHEN rankings.ranking <= 10 THEN 1 ELSE NULL END) AS times_in_top_ten, (SELECT avr_ranking FROM average_ranking_without_current WHERE song_name = songs.song_name) AS last_average_ranking, (SELECT ranking AS peak FROM rankedSongs WHERE peakrn = 1 AND song_name = songs.song_name) AS peak, SUM(ABS(next_ranking - rankings.ranking)) AS total_score_difference, RANK () OVER (ORDER BY (COUNT(CASE WHEN rankings.ranking <= 10 THEN 1 ELSE NULL END)) DESC) AS top_ten_award, RANK () OVER (ORDER BY CASE WHEN AVG(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN AVG(ABS(next_ranking - rankings.ranking)) ELSE 0 END DESC) AS most_difference_award, RANK () OVER (ORDER BY CASE WHEN AVG(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN AVG(ABS(next_ranking - rankings.ranking)) ELSE 100000 END ASC) AS most_stable_award, RANK () OVER(ORDER BY (SELECT ranking FROM rankedSongs WHERE worstrn = 1 AND song_name = songs.song_name) - (SELECT ranking FROM rankedSongs WHERE peakrn = 1 AND song_name = songs.song_name) DESC) AS gap_award FROM rankings JOIN rankedSongs ON rankedSongs.song_id = rankings.song_id AND rankedSongs.date_id = rankings.date_id JOIN songs ON songs.id = rankings.song_id GROUP BY songs.id, songs.song_name, rankedSongs.album_name ORDER BY average_ranking");
        const polarChart = await db.query("WITH rankedSongs AS (SELECT song_id, album_id, album_name, album_color, ranking, date_id FROM songs JOIN rankings ON songs.id = song_id JOIN albums ON album_id = albums.id), rankedSongs2 AS (SELECT rankedSongs.album_id AS id, album_color, ROW_NUMBER() OVER (ORDER BY AVG(rankings.ranking) ASC) AS ranking, rankedSongs.album_name, AVG(rankings.ranking) AS average_ranking FROM rankings JOIN rankedSongs ON rankedSongs.song_id = rankings.song_id AND rankedSongs.date_id = rankings.date_id JOIN songs ON songs.id = rankings.song_id GROUP BY songs.id, songs.song_name, rankedSongs.album_name, rankedSongs.album_id, album_color) SELECT id, album_name, album_color, COUNT (CASE WHEN ranking <= (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ranking) FROM rankings) THEN 1 ELSE null END) AS s_in_top_50_percent FROM rankedSongs2 WHERE id != 0 GROUP BY id, album_name, album_color ORDER BY id");
        const albumRanking = await db.query("WITH album_chart AS (SELECT DISTINCT ON (song_name) albums.id AS id, album_name, album_color, CASE WHEN ROUND(((SELECT COUNT(DISTINCT song_id) FROM rankings) / 2) - AVG(ranking) OVER (PARTITION BY song_name)) < 0 THEN 0 ELSE ROUND(((SELECT COUNT(DISTINCT song_id) FROM rankings) / 2) - AVG(ranking) OVER (PARTITION BY song_name)) END AS points FROM albums JOIN songs ON albums.id = album_id JOIN rankings ON songs.id = song_id) SELECT album_chart.id AS id, ROW_NUMBER() OVER (ORDER BY SUM(points) DESC) AS ranking, album_chart.album_name, album_chart.album_color, SUM(points) AS total_points FROM album_chart WHERE id != 0 GROUP BY id, album_chart.album_name, album_chart.album_color ORDER BY ranking");

        res.render("average-songs-ranking.ejs", { 
            averageChartData: rankings.rows, 
            allDates: dates,
            polarChartsAlbumName: polarChart.rows.map(item => item.album_name),
            polarChartsData: polarChart.rows.map(item => item.s_in_top_50_percent),
            polarChartsColor: polarChart.rows.map(item => (item.album_color + "99")),
            albumRanking: albumRanking.rows
        });        
    } catch (err) {
        console.log(err);
    } 
});
 
//專輯平均排名頁面
app.get("/albums-ranking", async (req, res) => {
    try {
        const albumRnkingDB = await db.query("WITH album_chart AS (SELECT DISTINCT ON (song_name) albums.id AS id, album_name, song_name, AVG(ranking) OVER (PARTITION BY song_name) AS song_average_ranking, CASE WHEN ROUND(((SELECT COUNT(DISTINCT song_id) FROM rankings) / 2) - AVG(ranking) OVER (PARTITION BY song_name)) < 0 THEN 0 ELSE ROUND(((SELECT COUNT(DISTINCT song_id) FROM rankings) / 2) - AVG(ranking) OVER (PARTITION BY song_name)) END AS points FROM albums JOIN songs ON albums.id = album_id JOIN rankings ON songs.id = song_id ), last_album_song_chart AS(SELECT album_name, song_name, rankings.id AS id, CASE WHEN (date_id < (SELECT MAX(date_id) FROM rankings)) THEN CASE WHEN ROUND(((SELECT COUNT(DISTINCT song_id) FROM rankings) / 2) - AVG(ranking) OVER (PARTITION BY song_name)) < 0 THEN 0 ELSE ROUND(((SELECT COUNT(DISTINCT song_id) FROM rankings) / 2) - AVG(ranking) OVER (PARTITION BY song_name)) END ELSE NULL END AS last_points FROM albums JOIN songs ON albums.id = album_id JOIN rankings ON songs.id = song_id WHERE date_id < (SELECT MAX(date_id) FROM rankings) OR song_id IN ( SELECT song_id FROM rankings GROUP BY song_id HAVING COUNT(*) = 1) ), last_album_chart AS(SELECT album_name, song_name, last_points FROM last_album_song_chart GROUP BY album_name, song_name, last_points ) SELECT album_chart.id AS id, ROW_NUMBER() OVER (ORDER BY SUM(points) DESC) AS ranking, album_chart.album_name, ROUND(AVG(song_average_ranking)) AS songs_average_ranking, SUM(points) AS total_points, SUM(last_points) AS total_last_points, ROW_NUMBER() OVER (ORDER BY SUM(CASE WHEN last_points IS NOT NULL THEN last_points ELSE 0 END) DESC) AS last_ranking FROM album_chart JOIN last_album_chart ON last_album_chart.song_name = album_chart.song_name WHERE id != 0 GROUP BY id, album_chart.album_name");
        const allDateIdDB = await db.query("SELECT id, date FROM dates ORDER BY id"); 
        const pr50DB = await db.query("SELECT album_id, date_id, date, info, COUNT(CASE WHEN ranking <= (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ranking) FROM rankings) THEN 1 ELSE NULL END) AS s_in_50_percent FROM rankings JOIN songs ON songs.id = song_id JOIN dates ON dates.id = date_id WHERE album_id != 0 GROUP BY album_id, date_id, date, info ORDER BY album_id, date_id");
        const allAlbumDB = await db.query("SELECT id, album_name, album_color FROM albums WHERE id != 0");

        const pr50LineChart = allAlbumDB.rows.map(item => ({
            albumName: item.album_name,
            albumColor: item.album_color,
            pr50Data: allDateIdDB.rows.map(dateItem => 
                pr50DB.rows.find(pr50item => (pr50item.album_id === item.id && pr50item.date_id === dateItem.id))?.s_in_50_percent ?? null)
        }))


        res.render("album-ranking.ejs", { 
            chartData:  albumRnkingDB.rows, 
            dateData: allDateIdDB.rows.map(item => alterDateFormat(item.date)),
            lineChartData: pr50LineChart
          });
    } catch (err) {
        console.log(err);
    }
    
});

//單首歌曲資訊頁面
app.get("/songs-ranking/song/:song", async (req, res) => {
    const songId = req.params.song;
    try {
        const songStatics = await db.query("WITH rankedSongs AS (SELECT song_id, song_name, album_name, ranking, date_id, ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking ASC) AS peakrn, ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking DESC) AS worstrn, LEAD(ranking) OVER (PARTITION BY songs.id ORDER BY date_id) AS next_ranking FROM songs JOIN rankings ON songs.id = song_id JOIN albums ON album_id = albums.id), songsStatics AS (SELECT songs.id AS id, ROW_NUMBER() OVER (ORDER BY AVG(rankings.ranking) ASC) AS ranking, songs.song_name, rankedSongs.album_name, AVG(rankings.ranking) AS average_ranking, COUNT(CASE WHEN rankings.ranking <= 10 THEN 1 ELSE NULL END) AS times_in_top_ten, (SELECT ranking FROM rankedSongs WHERE peakrn = 1 AND song_name = songs.song_name) AS peak, (SELECT ranking FROM rankedSongs WHERE worstrn = 1 AND song_name = songs.song_name) AS worst, SUM(ABS(next_ranking - rankings.ranking)) AS total_score_difference, RANK () OVER (ORDER BY (COUNT(CASE WHEN rankings.ranking <= 10 THEN 1 ELSE NULL END)) DESC) AS top_ten_award, RANK () OVER (ORDER BY CASE WHEN AVG(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN AVG(ABS(next_ranking - rankings.ranking)) ELSE 0 END DESC) AS most_difference_award, RANK () OVER (ORDER BY CASE WHEN AVG(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN AVG(ABS(next_ranking - rankings.ranking)) ELSE 1000 END ASC) AS most_stable_award, RANK () OVER(ORDER BY (SELECT ranking FROM rankedSongs WHERE worstrn = 1 AND song_name = songs.song_name) - (SELECT ranking FROM rankedSongs WHERE peakrn = 1 AND song_name = songs.song_name) DESC) AS gap_award FROM rankings JOIN rankedSongs ON rankedSongs.song_id = rankings.song_id AND rankedSongs.date_id = rankings.date_id JOIN songs ON songs.id = rankings.song_id GROUP BY songs.id, songs.song_name, rankedSongs.album_name ORDER BY average_ranking) SELECT * FROM songsStatics WHERE id = $1", [songId]);
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

//單張專輯資訊頁面
app.get("/albums-ranking/:id", async (req, res) => {
    const albumId = req.params.id;
    try {
        const statics = await db.query("WITH rankedSongs AS (SELECT song_id, album_id, song_name, album_name, ranking, date_id, ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking ASC) AS peakrn, ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking DESC) AS worstrn, LEAD(ranking) OVER (PARTITION BY songs.id ORDER BY date_id) AS next_ranking FROM songs JOIN rankings ON songs.id = song_id JOIN albums ON album_id = albums.id), rankedSongs2 AS (SELECT rankedSongs.album_id AS id, songs.id AS song_id, ROW_NUMBER() OVER (ORDER BY AVG(rankings.ranking) ASC) AS ranking, songs.song_name, rankedSongs.album_name, AVG(rankings.ranking) AS average_ranking, RANK () OVER (ORDER BY COUNT(CASE WHEN rankings.ranking <= 10 THEN 1 ELSE NULL END) DESC) AS top_ten_award, COUNT (CASE WHEN rankings.ranking = 1 THEN 1 ELSE NULL END) AS top_one_award, RANK () OVER (ORDER BY CASE WHEN SUM(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN SUM(ABS(next_ranking - rankings.ranking)) ELSE 0 END DESC) AS soaring_award, RANK () OVER (ORDER BY CASE WHEN SUM(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN SUM(ABS(next_ranking - rankings.ranking)) ELSE 1000 END ASC) AS anchored_award, RANK () OVER (ORDER BY (SELECT ranking FROM rankedSongs WHERE worstrn = 1 AND song_name = songs.song_name) - (SELECT ranking FROM rankedSongs WHERE peakrn = 1 AND song_name = songs.song_name) DESC) AS gap_award FROM rankings JOIN rankedSongs ON rankedSongs.song_id = rankings.song_id AND rankedSongs.date_id = rankings.date_id JOIN songs ON songs.id = rankings.song_id GROUP BY songs.id, songs.song_name, rankedSongs.album_name, rankedSongs.album_id) SELECT id, album_name, ROUND(AVG(average_ranking)) AS songs_avr_ranking, COUNT(CASE WHEN top_ten_award <= 5 THEN 1 ELSE NULL END) AS count_top_ten_award, COUNT(CASE WHEN anchored_award <= 10 THEN 1 ELSE NULL END) AS count_anchored_award, COUNT(CASE WHEN soaring_award <= 10 THEN 1 ELSE NULL END) AS count_soaring_award, COUNT(CASE WHEN gap_award <= 10 THEN 1 ELSE NULL END) AS count_gap_award, SUM(top_one_award) AS count_top_one_award, COUNT(CASE WHEN ranking <= 10 THEN 1 ELSE NULL END) AS songs_in_10, COUNT(CASE WHEN ranking <= 50 THEN 1 ELSE NULL END) AS songs_in_50, COUNT(CASE WHEN ranking <= 100 THEN 1 ELSE NULL END) AS songs_in_100, SUM(CASE WHEN ROUND(100 - average_ranking) < 0 THEN 0 ELSE ROUND(100 - average_ranking) END) AS total_points FROM rankedSongs2 WHERE id = $1 GROUP BY id, album_name", [albumId]);
        const songsHistory = await db.query("WITH rankedSongs AS (SELECT song_id, album_id, song_name, album_name, ranking, date_id, ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking ASC) AS peakrn, ROW_NUMBER() OVER (PARTITION BY songs.id ORDER BY ranking DESC) AS worstrn, LEAD(ranking) OVER (PARTITION BY songs.id ORDER BY date_id) AS next_ranking FROM songs JOIN rankings ON songs.id = song_id JOIN albums ON album_id = albums.id), rankedSongs2 AS (SELECT rankedSongs.album_id AS id, songs.id AS song_id, ROW_NUMBER() OVER (ORDER BY AVG(rankings.ranking) ASC) AS ranking, songs.song_name, rankedSongs.album_name, AVG(rankings.ranking) AS average_ranking, RANK () OVER (ORDER BY (COUNT(CASE WHEN rankings.ranking <= 10 THEN 1 ELSE NULL END)) DESC) AS top_ten_award, COUNT (CASE WHEN rankings.ranking = 1 THEN 1 ELSE NULL END) AS top_one_award, RANK () OVER (ORDER BY CASE WHEN SUM(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN SUM(ABS(next_ranking - rankings.ranking)) ELSE 0 END DESC) AS soaring_award, RANK () OVER (ORDER BY CASE WHEN SUM(ABS(next_ranking - rankings.ranking)) IS NOT NULL THEN SUM(ABS(next_ranking - rankings.ranking)) ELSE 1000 END ASC) AS anchored_award, RANK () OVER(ORDER BY (SELECT ranking FROM rankedSongs WHERE worstrn = 1 AND song_name = songs.song_name) - (SELECT ranking FROM rankedSongs WHERE peakrn = 1 AND song_name = songs.song_name) DESC) AS gap_award FROM rankings JOIN rankedSongs ON rankedSongs.song_id = rankings.song_id AND rankedSongs.date_id = rankings.date_id JOIN songs ON songs.id = rankings.song_id GROUP BY songs.id, songs.song_name, rankedSongs.album_name, rankedSongs.album_id) SELECT id, song_id, ranking, song_name, album_name, top_ten_award, top_one_award, soaring_award, anchored_award, gap_award FROM rankedSongs2 WHERE id = $1 ORDER BY ranking", [albumId]);
        const album = await db.query("WITH album_chart AS (SELECT DISTINCT ON (song_name) albums.id AS id, album_name, album_color, release_date, song_name, AVG(ranking) OVER (PARTITION BY song_name) AS song_average_ranking, CASE WHEN ROUND(100 - AVG(ranking) OVER (PARTITION BY song_name)) < 0 THEN 0 ELSE ROUND(100 - AVG(ranking) OVER (PARTITION BY song_name)) END AS points FROM albums JOIN songs ON albums.id = album_id JOIN rankings ON songs.id = song_id), albumStatic AS (SELECT album_chart.id AS id, ROW_NUMBER() OVER (ORDER BY SUM(points) DESC) AS ranking, album_chart.album_name, album_color, release_date, ROUND(AVG(song_average_ranking)) AS songs_average_ranking FROM album_chart GROUP BY id, album_chart.album_name, album_color, release_date) SELECT * FROM albumStatic where id = $1", [albumId]);
        const lineChart = await db.query("SELECT album_id, date_id, date, info, COUNT(CASE WHEN ranking <= (SELECT PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ranking) FROM rankings) THEN 1 ELSE NULL END) AS s_in_25_percent, COUNT(CASE WHEN ranking <= (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ranking) FROM rankings) THEN 1 ELSE NULL END) AS s_in_50_percent FROM rankings JOIN songs ON songs.id = song_id JOIN dates ON dates.id = date_id WHERE album_id = $1 GROUP BY album_id, date_id, date, info ORDER BY date_id", [albumId])

        const albumStatics = statics.rows[0];
        const songsData = songsHistory.rows;
        const albumInfo = album.rows.map( item => ({
            id: item.id,
            ranking: item.ranking,
            album_name: item.album_name,
            album_color: item.album_color,
            release_date: item.release_date === null ? "No Data" : alterDateFormatToLong(item.release_date)
        }));


        res.render("album-info.ejs", { 
            albumStatics: albumStatics, 
            songsData: songsData, 
            albumInfo: albumInfo[0],
            dateData: lineChart.rows.map(item => alterDateFormat(item.date)),
            topFiftyData: lineChart.rows.map(item => item.s_in_50_percent),
            topTwentyFiveData: lineChart.rows.map(item => item.s_in_25_percent),
        });
    } catch (err) {
        console.log(err);
    }  
})

app.get("/sorter", async (req, res) => {
    const songsDB = await db.query("SELECT album_name, song_name FROM albums JOIN songs ON albums.id = songs.album_id");

    res.render("sorter.ejs", {songs: songsDB.rows});
});

//SORTER POST
app.post("/post-array", async (req, res) => {
    const dataArray = req.body; 
    const allSongs = await db.query("SELECT id, song_name FROM songs");
    const dateId = await db.query("INSERT INTO datesTest (date, info) VALUES ($1, $2) RETURNING id", [dataArray.date, dataArray.event]);

    const songsIdRanking = req.body.data.map(songName => (allSongs.rows.find(item => item.song_name === songName).id));
    const rankingValues = songsIdRanking.map( (songId, index) => `(${songId}, ${dateId.rows[0].id}, ${index + 1})`).join(", ");

    await db.query(`INSERT INTO rankingsTest (song_id, date_id, ranking) VALUES ${rankingValues}`);

    console.log(rankingValues);
    console.log('Received array:', dataArray);

    res.sendStatus(200);
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

