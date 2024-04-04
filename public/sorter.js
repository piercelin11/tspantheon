let namMember = [
    "Tim McGraw",
    "Picture to Burn",
    "Teardrops on My Guitar",
    "A Place in This World",
    "Cold as You",
    "The Outside"
];

let array = [];
let lstMember = [];
let parent = [];
let equal = [];
let rec = [];
let cmp1, cmp2;
let head1, head2;
let nrec;
let numQuestion;
let totalSize;
let finishSize;
let finishFlag;

//將歌曲分割成小單位
function initList() {
    var n = 0;
    var mid;
    var i;

    lstMember[n] = [];
    for (i = 0; i < namMember.length; i++) {
        lstMember[n][i] = i;
    }
    parent[n] = -1;
    totalSize = 0;
    n++;

    for (i = 0; i < lstMember.length; i++) {
        if (lstMember[i].length >= 2) {
            mid = Math.ceil(lstMember[i].length / 2);
            lstMember[n] = lstMember[i].slice(0, mid);
            totalSize += lstMember[n].length;
            parent[n] = i;
            n++;
            lstMember[n] = lstMember[i].slice(mid, lstMember[i].length);
            totalSize += lstMember[n].length;
            parent[n] = i;
            n++;
        }
    }

    for (i = 0; i < namMember.length; i++) {
        rec[i] = 0;
    }
    nrec = 0;

    for (i = 0; i <= namMember.length; i++) {
        equal[i] = -1;
    }

    cmp1 = lstMember.length - 2;
    cmp2 = lstMember.length - 1;
    head1 = 0;
    head2 = 0;
    numQuestion = 1;
    finishSize = 0;
    finishFlag = 0;
}

//用來對歌曲列表進行排序的根據 flag 的值，可以決定選擇左邊的歌曲、右邊的歌曲，或者宣告平局。
function sortList(flag) {
    var i;
    if (flag < 0) {
        rec[nrec] = lstMember[cmp1][head1];
        head1++;
        nrec++;
        finishSize++;
        while (equal[rec[nrec - 1]] != -1) {
            rec[nrec] = lstMember[cmp1][head1];
            head1++;
            nrec++;
            finishSize++;
        }
    } else if (flag > 0) {
        rec[nrec] = lstMember[cmp2][head2];
        head2++;
        nrec++;
        finishSize++;
        while (equal[rec[nrec - 1]] != -1) {
            rec[nrec] = lstMember[cmp2][head2];
            head2++;
            nrec++;
            finishSize++;
        }
    } else {
        rec[nrec] = lstMember[cmp1][head1];
        head1++;
        nrec++;
        finishSize++;
        while (equal[rec[nrec - 1]] != -1) {
            rec[nrec] = lstMember[cmp1][head1];
            head1++;
            nrec++;
            finishSize++;
        }
        equal[rec[nrec - 1]] = lstMember[cmp2][head2];
        rec[nrec] = lstMember[cmp2][head2];
        head2++;
        nrec++;
        finishSize++;
        while (equal[rec[nrec - 1]] != -1) {
            rec[nrec] = lstMember[cmp2][head2];
            head2++;
            nrec++;
            finishSize++;
        }
    }

    if (head1 < lstMember[cmp1].length && head2 == lstMember[cmp2].length) {
        while (head1 < lstMember[cmp1].length) {
            rec[nrec] = lstMember[cmp1][head1];
            head1++;
            nrec++;
            finishSize++;
        }
    } else if (head1 == lstMember[cmp1].length && head2 < lstMember[cmp2].length) {
        while (head2 < lstMember[cmp2].length) {
            rec[nrec] = lstMember[cmp2][head2];
            head2++;
            nrec++;
            finishSize++;
        }
    }

    if (head1 == lstMember[cmp1].length && head2 == lstMember[cmp2].length) {
        for (i = 0; i < lstMember[cmp1].length + lstMember[cmp2].length; i++) {
            lstMember[parent[cmp1]][i] = rec[i];
        }
        lstMember.pop();
        lstMember.pop();
        cmp1 = cmp1 - 2;
        cmp2 = cmp2 - 2;
        head1 = 0;
        head2 = 0;

        if (head1 == 0 && head2 == 0) {
            for (i = 0; i < namMember.length; i++) {
                rec[i] = 0;
            }
            nrec = 0;
        }
    }

    if (cmp1 < 0) {
        var str = Math.floor(finishSize * 100 / totalSize) + "% sorted.";
        document.getElementById("battleNumber").innerHTML = str;
        showResult();
        finishFlag = 1;
    } else {
        showImage();
    }
}

//顯示最終排序結果
function showResult() {
    var ranking = 1;
    var sameRank = 1;
    var str = "";
    var i;

    str += "<table style=\"width:330px; font-size:17px; line-height:120%; margin-left:auto; margin-right:auto; padding:5px; line-height:35px; border:1px solid #000; border-collapse:collapse\" align=\"center\">";
    str += "<tr><td style=\"color:#ffffff; background-color:#2D2D2D; padding-right:10px; padding-left:10px; text-align:center; border:1px solid #000;\">RANK<\/td><td style=\"color:#ffffff; background-color:#2D2D2D; text-align:center;\">SONGS<\/td><\/tr>";

    for (i = 0; i < namMember.length; i++) {
        str += "<tr><td style=\"border:1px solid #000; text-align:center; padding-right:5px;\">" + ranking + "<\/td><td style=\"border:1px solid #000; padding-left:5px;\">" + namMember[lstMember[0][i]] + "<\/td><\/tr>";
        if (i < namMember.length - 1) {
            if (equal[lstMember[0][i]] == lstMember[0][i + 1]) {
                sameRank++;
            } else {
                ranking += sameRank;
                sameRank = 1;
            }
        }
    }
    str += "<\/table>";

    for (i = 0; i < namMember.length; i++) {
    array[i] = namMember[lstMember[0][i]];
    }

    document.getElementById("resultField").innerHTML = str;
}

//將排序數字轉換成歌名
function toNameFace(n) {
    var str = namMember[n];
    return str;
}

//將歌名顯示於比較兩首歌曲的表格中
function showImage() {
    var str0 = Math.floor(finishSize * 100 / totalSize) + "% sorted.";
    var str1 = "" + toNameFace(lstMember[cmp1][head1]);
    var str2 = "" + toNameFace(lstMember[cmp2][head2]);

    document.getElementById("battleNumber").innerHTML = str0;
    document.getElementById("leftField").innerHTML = str1;
    document.getElementById("rightField").innerHTML = str2;

    numQuestion++;
}

document.querySelector(".btn2").addEventListener("click", () => {console.log(array);});

initList();
showImage();

document.querySelector("#myForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    console.log(e);
    console.log(e.target);

    const formData = new FormData(e.target);
    const event = formData.get("event");

    const data = array;
    const date = new Date();

    try {
        const response = await fetch("/post-array", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ event, date, data })
        });

        if (response.ok) {
            console.log("Array posted successfully!");
        } else {
            console.error("Failed to post array:", response.statusText);
        }
    } catch (error) {
        console.error("Error posting array:", error);
    }
});