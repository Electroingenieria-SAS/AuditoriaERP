

let notifications = JSON.parse(
    localStorage.getItem("notifications")
) || [];



function renderNotifications(){

    const list =
        document.getElementById(
            "notification-list"
        );

    const count =
        document.getElementById(
            "notification-count"
        );

    

    list.innerHTML = "";

    

    notifications.forEach((notification) => {

        const li =
            document.createElement("li");

        li.innerHTML = `
            <strong>${notification.user}</strong>
            actualizó:
            ${notification.message}
            <br>
            <small>${notification.date}</small>
        `;

        list.appendChild(li);
    });

   

    count.innerText = notifications.length;
}



function addNotification(user, message){

    const notification = {

        user: user,

        message: message,

        date: new Date().toLocaleString()
    };

    

    notifications.unshift(notification);

   

    localStorage.setItem(
        "notifications",
        JSON.stringify(notifications)
    );

    

    renderNotifications();
}



function createNotification(){

    addNotification(
        "Carlos",
        "Actualizó el inventario"
    );
}



renderNotifications();