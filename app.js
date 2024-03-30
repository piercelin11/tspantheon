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
        
        console.log(peaks.rows);
        //合併三個陣列
        const chartData = currentRankings.rows.map( songData => ({
            songName: songData.song_name,
            albumName: songData.album_name,
            currentRanking: songData.current_ranking,
            //是否為第一筆資料因此上一筆資料為空陣列
            lastRanking: lastRankings.rows.length === 0 ? "" : lastRankings.rows.find( item => item.song_name === songData.song_name ).last_ranking,
            //是否為最新的歌曲排名，是則顯示peak不是則不顯示peak
            peak: mostRecentDateId === CurrentDateId ? peaks.rows.find( item => item.song_name === songData.song_name ).peak : "",
            difference: lastRankings.rows.length === 0 ? "" : lastRankings.rows.find( item => item.song_name === songData.song_name ).last_ranking - songData.current_ranking
        }));

        res.render("songs-ranking.ejs", { 
            allDates: dates, 
            currentDate: date[0], 
            chartData: chartData
        });
        
    } catch (err) {
        console.log(err);
    }
    
       
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
