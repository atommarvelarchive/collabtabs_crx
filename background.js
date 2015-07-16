collabWindow = null;
socket = null;
tabs = [];
ignoreCreation = [];
ignoreNavigation = [];
ignoreRemoval = [];

//TODO: close tabs
//TODO: handle sending bad chrome-extension links

chrome.browserAction.onClicked.addListener(function(){
    createWindow();
    initSocketIO();
});


function createWindow(){
    chrome.windows.create({url: "https://search.yahoo.com"}, function(window){
        collabWindow = window;
        tabs = [window.tabs[0].id];
    });
}

function initSocketIO(){
    socket = io("http://localhost:3000");
    socket.on("connect", function(){
        console.log("connected to server");
    });
    socket.on("new tab", function(data){
        console.log("opening new tab");
        chrome.tabs.create({windowId: collabWindow.id, url: data.url, index: data.index, active: false}, function(tab){
            ignoreCreation.push(tab.id);
            tabs.splice(data.index,0, tab.id)
        });
    });
    socket.on("tab navigation", function(data){
        console.log("navigating");
        chrome.tabs.query({windowId: collabWindow.id, index: data.index}, function(result){
            if(result[0] && result[0].url !== data.url && !(/chrome-extension/.test(data.url))){
                tab = result[0];
                chrome.tabs.update(tab.id, {url: data.url});
                ignoreNavigation.push(data.url);
                setTimeout((function(data){
                    var removal = ignoreNavigation.indexOf(data.url);
                    ignoreNavigation.splice(removal,1);
                }).bind(this,data), 10 * 1000);
            }
        });
    });

    socket.on("remove tab", function(data){
        console.log("removing tab");
        if(ignoreRemoval.indexOf(data.index) === -1){
            chrome.tabs.get(tabs[data.index], function(tab){
                chrome.tabs.remove(tab.id);
                tabs.splice(data.index, 1);
            })
        }
    });

    //report tab creation
    chrome.tabs.onCreated.addListener(function(tab){
        if(tab.windowId === collabWindow.id ){
            tabs.splice(tab.index,0, tab.id)
            setTimeout(reportTabCreation.bind(this,tab.id), 300);
        }
    });
    //report tab navigation
    chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab){
        if(tab.windowId === collabWindow.id){
            setTimeout((function(tab){
                if(changeInfo.url && ignoreNavigation.indexOf(changeInfo.url) === -1){
                    socket.emit("tab navigation", {url: changeInfo.url, index: tab.index});
                }
            }).bind(this,tab), 300);
        }
    });

    //report tab removal
    chrome.tabs.onRemoved.addListener(function(tabId, removeInfo){
        if(removeInfo.windowId === collabWindow.id){
            var delIdx = tabs.indexOf(tabId);
            if(delIdx !== -1){
                tabs.splice(delIdx,1);
                ignoreRemoval.push(delIdx);
                reportTabRemoval(delIdx);
                setTimeout(function(){
                    ignoreRemoval.splice(ignoreRemoval.indexOf(delIdx),1);
                }, 300);
            }
        }
    });

    function reportTabRemoval(delIdx){
        socket.emit("remove tab", {index: delIdx});
    }

    function reportTabCreation(tabId){
        chrome.tabs.get(tabId, function(tab){
            if(ignoreCreation.indexOf(tab.id) === -1){
                socket.emit("new tab", {url: tab.url, index: tab.index});
            }
        });
    }
}
