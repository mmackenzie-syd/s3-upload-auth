const albumBucketName = 'upload-auth-syd';

const {
    CognitoUserPool,
    CognitoUserAttribute,
    CognitoUser,
    AuthenticationDetails,
} = AmazonCognitoIdentity;

AWS.config.region = 'ap-southeast-2';

// User Access
const poolData = {
    UserPoolId : 'xxxx',
    ClientId : 'xxxx'
};
const userPool = new CognitoUserPool(poolData);
let cognitoUser;
let token = null;
let s3;

const setCredentials = (token) => {
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
        IdentityPoolId: 'xxxx',
        Logins: {
            'xxxx': token
        }
    });

    s3 = new AWS.S3({
        apiVersion: '2006-03-01',
        params: {Bucket: albumBucketName}
    });
    listAlbums();
}

const handleSubmit = (event) => {
    event.preventDefault();
    const uname = document.getElementById("uname");
    const password = document.getElementById("password");
    signin(uname.value, password.value);
}

const handleReset = (event) => {
    event.preventDefault();
    const password = document.getElementById("newpasswd");
    console.log('reset-1', password.value)
    reset(password.value);
}

const signin = (email, password) => {
    const authenticationData = {
        Username: email,
        Password: password,
    };
    const authenticationDetails = new AuthenticationDetails(
        authenticationData
    );

    const userData = {
        Username: email,
        Pool: userPool,
    };
    cognitoUser = new CognitoUser(userData);
    cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: function(result) {
            document.getElementById("signin").style.display = "none";
            token = result.getIdToken().getJwtToken();

            setCredentials(token);
        },
        newPasswordRequired: function(result, session) {
            const { email } = result;
            document.getElementById("signin").style.display = "none";
            document.getElementById("reset").style.display = "block";
        },
        onFailure: function(err) {
            alert(err.message || JSON.stringify(err));
        },
    });
}

const reset = (password) => {
    cognitoUser.completeNewPasswordChallenge(password, [], {
        onSuccess: function(result) {
            token = result.getIdToken().getJwtToken();
            setCredentials(token);
            document.getElementById("reset").style.display = "none";
        },
        onFailure: function(err) {
            alert(err.message || JSON.stringify(err));
        }}
    );
}

const signout = () => async(dispatch) => {
    cognitoUser.signOut();
    document.getElementById("signin").style.display = "block";
    token = null;
}

function getHtml(template) {
    return template.join('\n');
}

function listAlbums() {
    s3.listObjects({ Delimiter: "/" }, function(err, data) {
        if (err) {
            console.log('err', err);
            return alert("There was an error listing your albums: " + err.message);
        } else {
            var albums = data.CommonPrefixes.map(function(commonPrefix) {
                var prefix = commonPrefix.Prefix;
                var albumName = decodeURIComponent(prefix.replace("/", ""));
                return getHtml([
                    "<li>",
                    "<span onclick=\"deleteAlbum('" + albumName + "')\"  class='close'>&times;</span>",
                    "<span onclick=\"viewAlbum('" + albumName + "')\" class='album-name'>",
                    albumName,
                    "</span>",
                    "</li>"
                ]);
            });
            var message = albums.length
                ? getHtml([
                    "<p>Click on an album name to view it.</p>",
                    "<p>Click on the <span class='cross'>x</span> to delete the album.</p>"
                ])
                : "<p>You do not have any albums. Please Create album.";
            var htmlTemplate = [
                "<h2>Albums</h2>",
                message,
                "<ul>",
                getHtml(albums),
                "</ul>",
                "<button class='btn default' onclick=\"createAlbum(prompt('Enter Album Name:'))\">",
                "Create New Album",
                "</button>"
            ];
            document.getElementById("app").innerHTML = getHtml(htmlTemplate);
        }
    });
}

function createAlbum(albumName) {
    albumName = albumName.trim();
    if (!albumName) {
        return alert("Album names must contain at least one non-space character.");
    }
    if (albumName.indexOf("/") !== -1) {
        return alert("Album names cannot contain slashes.");
    }
    var albumKey = encodeURIComponent(albumName) + '/';


    s3.headObject({ Key: albumKey }, function(err, data) {
        if (!err) {
            return alert("Album already exists.");
        }
        if (err.code !== "NotFound") {
            return alert("There was an error creating your album: " + err.message);
        }
        s3.putObject({ Key: albumKey }, function(err, data) {
            if (err) {
                return alert("There was an error creating your album: " + err.message);
            }
            alert("Successfully created album.");
            viewAlbum(albumName);
        });
    });
}

function viewAlbum(albumName) {
    var albumPhotosKey = encodeURIComponent(albumName) + "/";
    s3.listObjects({ Prefix: albumPhotosKey }, function(err, data) {
        if (err) {
            return alert("There was an error viewing your album: " + err.message);
        }
        // 'this' references the AWS.Response instance that represents the response
        var href = this.request.httpRequest.endpoint.href;
        var bucketUrl = href + albumBucketName + "/";

        var filteredData = data.Contents.filter(photo => (photo.Key !== data.Prefix));

        var photos = filteredData.map(function(photo) {
            var photoKey = photo.Key;
            // var photoUrl = bucketUrl + encodeURIComponent(photoKey);
            var photoUrl = bucketUrl + photoKey;
            return getHtml([
                "<span>",
                "<div>",
                '<img style="width:128px;height:128px;" src="' + photoUrl + '"/>',
                "</div>",
                "<div class='photo-caption'>",
                "<span class='del' onclick=\"deletePhoto('" +
                albumName +
                "','" +
                photoKey +
                "')\">",
                "&times;",
                "</span>",
                "<span>",
                photoKey.replace(albumPhotosKey, ""),
                "</span>",
                "</div>",
                "</span>"
            ]);
        });
        var message = photos.length
            ? "<p>Click on the X to delete the photo</p>"
            : "<p>You do not have any photos in this album. Please add photos.</p>";
        var htmlTemplate = [
            "<h2>",
            "Album: " + albumName,
            "</h2>",
            message,
            "<div class='photos-list'>",
            getHtml(photos),
            "</div>",
            '<input id="photoupload" type="file" accept="image/*"><br/>',
            '<p></p>',
            '<button id="addphoto" class="btn default" onclick="addPhoto(\'' + albumName + "')\">",
            "Add Photo",
            "</button>",
            '<button class="btn default" onclick="listAlbums()">',
            "Back To Albums",
            "</button>"
        ];
        document.getElementById("app").innerHTML = getHtml(htmlTemplate);
    });
}

function addPhoto(albumName) {
    var files = document.getElementById("photoupload").files;
    if (!files.length) {
        return alert("Please choose a file to upload first.");
    }
    var file = files[0];
    var fileName = file.name;
    var albumPhotosKey = encodeURIComponent(albumName) + "/";

    var photoKey = albumPhotosKey + fileName;

    // Use S3 ManagedUpload class as it supports multipart uploads
    var upload = new AWS.S3.ManagedUpload({
        params: {
            Bucket: albumBucketName,
            Key: photoKey,
            Body: file,
            ACL: "public-read"
        }
    });

    var promise = upload.promise();

    promise.then(
        function(data) {
            alert("Successfully uploaded photo.");
            viewAlbum(albumName);
        },
        function(err) {
            return alert("There was an error uploading your photo: ", err);
        }
    );
}

function deletePhoto(albumName, photoKey) {
    s3.deleteObject({ Key: photoKey }, function(err, data) {
        if (err) {
            return alert("There was an error deleting your photo: ", err.message);
        }
        alert("Successfully deleted photo.");
        viewAlbum(albumName);
    });
}

function deleteAlbum(albumName) {
    var albumKey = encodeURIComponent(albumName) + "/";
    s3.listObjects({ Prefix: albumKey }, function(err, data) {
        if (err) {
            return alert("There was an error deleting your album: ", err.message);
        }
        var objects = data.Contents.map(function(object) {
            return { Key: object.Key };
        });
        s3.deleteObjects(
            {
                Delete: { Objects: objects, Quiet: true }
            },
            function(err, data) {
                if (err) {
                    return alert("There was an error deleting your album: ", err.message);
                }
                alert("Successfully deleted album.");
                listAlbums();
            }
        );
    });
}

