

$(document).ready (function(){

});



function queryCertStatus(companyId) {
    //console.log("following company")
    $.ajax({
        url: window.location.href + "/query-cert-status",
        contentType: 'application/json; charset=utf-8',
        dataType: 'json',
        data: JSON.stringify({companyId}),
        type: 'POST',
        success: ((res) => {
            // Replace follow button with unfollow.
            console.log("Success", res)
            let cert_status;
            if (res.msg == "ISSUED") {
                cert_status = "<span class='text-success'>" +res.msg + "</p>" 
            } else {
                cert_status = "<span class='text-danger'>" +res.msg + "</p>" 
            }
            $("#certificate_status").replaceWith(cert_status)
        }),
        error: ((error) => {
            console.log("Error:", error);
        })
    });
}

function installCertificate(companyId) {
    //console.log("following company")
    $.ajax({
        url: window.location.href + "/install-cert",
        contentType: 'application/json; charset=utf-8',
        dataType: 'json',
        data: JSON.stringify({companyId}),
        type: 'POST',
        success: ((res) => {
            // Replace follow button with unfollow.
            console.log("Success", res)
            let install_status;

            if (res.msg == "success")
                install_status = "<span class='text-succcess'>" + "Certificate Installed." + "</p>" 
            else
                install_status = "<span class='text-danger'>" + "Certificate Install Failed." + "</p>" 
            $("#install_status").replaceWith(install_status);
        }),
        error: ((error) => {
            console.log("Error:", error);
        })
    });
}