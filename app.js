const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
const mailgun = require("mailgun-js");
const port = 3000;

app.use(cors());

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Kcha1234&&",
  database: "rentamovie",
});
//connect to the database
db.connect((err) => {
  if (err) {
    console.log("error connecting to database", err);
    return;
  }
  console.log("Connected to database");
});

app.use(bodyParser.json());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("hello world!");
});
//==========================MOVIES========================
// Create a new movie+
app.post("/movies", (req, res) => {
  const { Title, Type, Price, Quantity, image_link, description, actors } =
    req.body;

  db.query(
    `INSERT INTO movie (Title, Type, Price, Quantity, image_link, description) VALUES (?, ?, ?, ?, ?, ?)`,
    [Title, Type, Price, Quantity, image_link, description],
    (error, result) => {
      if (error) {
        console.error(error);
        return res
          .status(500)
          .json({ success: false, error: "Failed to add movie" });
      }

      const movieId = result.insertId;

      actors.forEach((actorName) => {
        db.query(
          `SELECT ActorID FROM actor WHERE ActorName = ?`,
          [actorName],
          (error, actor) => {
            if (error) {
              console.error(error);
              return res
                .status(500)
                .json({ success: false, error: "Failed to fetch actor" });
            }

            let actorId;

            if (actor.length === 0) {
              db.query(
                `INSERT INTO actor (ActorName) VALUES (?)`,
                [actorName],
                (error, actorResult) => {
                  if (error) {
                    console.error(error);
                    return res
                      .status(500)
                      .json({ success: false, error: "Failed to add actor" });
                  }
                  actorId = actorResult.insertId;

                  db.query(
                    `INSERT INTO movieactor (MovieID, ActorID) VALUES (?, ?)`,
                    [movieId, actorId],
                    (error) => {
                      if (error) {
                        console.error(error);
                        return res.status(500).json({
                          success: false,
                          error: "Failed to associate actor with movie",
                        });
                      }
                    }
                  );
                }
              );
            } else {
              actorId = actor[0].ActorID;

              db.query(
                `INSERT INTO movieactor (MovieID, ActorID) VALUES (?, ?)`,
                [movieId, actorId],
                (error) => {
                  if (error) {
                    console.error(error);
                    return res.status(500).json({
                      success: false,
                      error: "Failed to associate actor with movie",
                    });
                  }
                }
              );
            }
          }
        );
      });

      res.status(200).json({
        success: true,
        message: "Movie and actors added successfully",
      });
    }
  );
});

// show movies
app.get("/movies", (req, res) => {
  db.query(
    `
    SELECT 
    movie.MovieID, 
    movie.Type, 
    movie.image_link,
    movie.description,
    movie.TotalPrice,
    movie.Tax,
    movie.Price, 
    movie.Title, 
    GROUP_CONCAT(actor.ActorName ORDER BY actor.ActorName SEPARATOR ', ') AS Actors
FROM 
    movie 
    JOIN movieactor ON movie.MovieID = movieactor.MovieID 
    JOIN actor ON movieactor.ActorID = actor.ActorID 
GROUP BY 
    movie.MovieID, 
    movie.Type, 
    movie.description, 
    movie.Title
ORDER BY 
    movie.MovieID;`,
    (err, results) => {
      if (err) {
        return res.status(500).send(err);
      }
      res.json(results);
    }
  );
});

// show movie details
app.get("/movies/:id", (req, res) => {
  db.query(
    `
    SELECT 
    movie.MovieID, 
    movie.Type, 
    movie.image_link,
    movie.description, 
    movie.Title, 
    movie.TotalPrice,
    movie.Tax,
    movie.Price,
    GROUP_CONCAT(actor.ActorName ORDER BY actor.ActorName SEPARATOR ', ') AS Actors
FROM 
    movie 
    JOIN movieactor ON movie.MovieID = movieactor.MovieID 
    JOIN actor ON movieactor.ActorID = actor.ActorID 
WHERE movie.MovieID = ${req.params.id}
GROUP BY 
    movie.MovieID, 
    movie.Type, 
    movie.description, 
    movie.Title
ORDER BY 
    movie.MovieID; `,
    (err, results) => {
      if (err) {
        return res.status(500).send(err);
      }
      res.json(results);
    }
  );
});

// Delete a movie by ID
app.delete("/movies/:id", (req, res) => {
  const movieID = req.params.id;

  db.beginTransaction((err) => {
    if (err) {
      return res.status(500).send(err);
    }

    const deleteMovieActorQuery = "DELETE FROM movieactor WHERE MovieID = ?";
    db.query(deleteMovieActorQuery, [movieID], (err) => {
      if (err) {
        return db.rollback(() => res.status(500).send(err));
      }

      const deleteMovieQuery = "DELETE FROM movie WHERE MovieID = ?";
      db.query(deleteMovieQuery, [movieID], (err, result) => {
        if (err) {
          return db.rollback(() => res.status(500).send(err));
        }
        if (result.affectedRows === 0) {
          return res.status(404).send("Movie not found");
        }

        db.commit((err) => {
          if (err) {
            return res.status(500).send(err);
          }
          res.status(200).send(`Movie with ID ${movieID} deleted`);
        });
      });
    });
  });
});
// ROUTE TO SEARCH FOR MOVIES
app.get("/search", (req, res) => {
  const searchTerm = req.query.q;
  const query = `
        SELECT 
    movie.MovieID, 
    movie.Type, 
    movie.image_link,
    movie.description, 
    movie.Title, 
    movie.TotalPrice,
    GROUP_CONCAT(actor.ActorName ORDER BY actor.ActorName SEPARATOR ', ') AS Actors
FROM 
    movie 
    JOIN movieactor ON movie.MovieID = movieactor.MovieID 
    JOIN actor ON movieactor.ActorID = actor.ActorID 
WHERE 
    actor.ActorName LIKE ?
    OR movie.Title LIKE ?
    OR movie.Type LIKE ?
GROUP BY 
    movie.MovieID, 
    movie.Type, 
    movie.description, 
    movie.Title
ORDER BY 
    movie.MovieID;
    `;

  db.query(
    query,
    [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`],
    (err, results) => {
      if (err) {
        return res.status(500).send(err);
      }
      res.json(results);
    }
  );
});

// ========================ACTORS================================
// Example route to fetch all actors
app.get("/movieactors", (req, res) => {
  const sql = `
    SELECT movie.MovieID, movie.Title, movie.Type, movie.description,  actor.ActorName
    FROM movie
    JOIN movieactor ON movie.MovieID = movieactor.MovieID
    JOIN actor ON movieactor.ActorID = actor.ActorID
    ORDER BY movie.MovieID
  `;

  db.query(sql, (error, results) => {
    if (error) {
      console.error(error);
      return res
        .status(500)
        .json({ error: "Failed to fetch movies and actors" });
    }
    res.status(200).json({ results });
  });
});
//=============================CUSTOMERS =============================
// Example route to fetch all customers
app.get("/customers", (req, res) => {
  db.query(
    "SELECT CustomerID, CONCAT(FirstName, ' ', LastName) AS CustomerName,  PhoneNumber, Email, StreetAddress, City, State, Zip FROM Customer ORDER BY LastName ASC;",
    (err, results) => {
      if (err) {
        return res.status(500).send(err);
      }
      res.json(results);
    }
  );
});
// Route to fetch single customer
app.get("/customers/:id", (req, res) => {
  db.query(
    `SELECT * FROM customer WHERE CustomerID = ${req.params.id}`,
    (err, results) => {
      if (err) {
        return res.status(500).send(err);
      }
      res.json(results);
    }
  );
});

// ROUTE TO SEARCH FOR CUSTOMERS
app.get("/searchcustomers", (req, res) => {
  const searchTerm = req.query.q;
  const query = `
        SELECT * FROM customer
        WHERE LastName LIKE ? OR PhoneNumber LIKE ?
    `;

  db.query(query, [`%${searchTerm}%`, `%${searchTerm}%`], (err, results) => {
    if (err) {
      return res.status(500).send(err);
    }
    res.json(results);
  });
});

// Create a new customer
app.post("/customers", (req, res) => {
  const {
    FirstName,
    LastName,
    PhoneNumber,
    Email,
    StreetAddress,
    City,
    State,
    Zip,
  } = req.body;

  const checkCustomerQuery =
    "SELECT * FROM customer WHERE Email = ? AND FirstName = ? AND LastName = ? ";
  db.query(checkCustomerQuery, [Email, FirstName, LastName], (err, results) => {
    if (err) {
      return res.status(500).send(err);
    }
    if (results.length > 0) {
      return res.status(400).send("Customer already exists");
    }

    // If customer already exists, insert it
    const query = `
    INSERT INTO customer (FirstName, LastName, PhoneNumber, Email, StreetAddress, City, State, Zip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      query,
      [
        FirstName,
        LastName,
        PhoneNumber,
        Email,
        StreetAddress,
        City,
        State,
        Zip,
      ],
      (err, result) => {
        if (err) {
          return res.status(500).send(err);
        }
        res.status(201).json({
          id: result.insertId,
          FirstName,
          LastName,
          PhoneNumber,
          Email,
          StreetAddress,
          City,
          State,
          Zip,
        });
      }
    );
  });
});

// Search if customer exists, If not, create.
// Route to search for an existing customer
app.post("/searchcustomer", (req, res) => {
  const { FirstName, LastName, Email } = req.body;

  db.query(
    `SELECT CustomerID FROM Customer WHERE FirstName = ? AND LastName = ? AND Email = ?`,
    [FirstName, LastName, Email],
    (err, results) => {
      if (err) {
        res
          .status(500)
          .json({ success: false, error: "Database query failed" });
      }

      if (results.length > 0) {
        return res
          .status(200)
          .json({ success: true, customerId: results[0].CustomerID });
      } else {
        res.status(404).json({ success: false, message: "Customer not found" });
      }
    }
  );
});

// =============================TRANSACTIONS===========================
// Get transactions
app.get("/transactions", (req, res) => {
  db.query(
    "WITH DailySpending AS ( SELECT rt.CustomerID, rt.Date, SUM(m.TotalPrice) AS DailyTotalSpent FROM RentalTransaction rt INNER JOIN RentedMovie rm ON rt.TransactionID = rm.TransactionID INNER JOIN Movie m ON rm.MovieID = m.MovieID GROUP BY rt.CustomerID, rt.Date) SELECT CONCAT(c.FirstName, ' ', c.LastName) AS CustomerName, ds.Date, m.Title AS VideoName, m.Price, m.Tax, m.TotalPrice, ds.DailyTotalSpent AS CumulativeTotalSpent FROM DailySpending ds INNER JOIN RentalTransaction rt ON ds.CustomerID = rt.CustomerID AND ds.Date = rt.Date INNER JOIN RentedMovie rm ON rt.TransactionID = rm.TransactionID INNER JOIN Movie m ON rm.MovieID = m.MovieID INNER JOIN Customer c ON ds.CustomerID = c.CustomerID ORDER BY CustomerName, ds.Date, m.Title;",
    (err, results) => {
      if (err) {
        return res.status(500).send(err);
      }
      res.json(results);
    }
  );
});
// Get total amounts spent per customer on each day
app.get("/transactions/totals", (req, res) => {
  db.query("", (err, results) => {
    if (err) {
      return res.status(500).send(err);
    }
    res.json(results);
  });
});
// ============================ TRANSACTIONS ============================
// Route to create a new transaction
app.post("/transactions", (req, res) => {
  const { CustomerID, Date, MovieID } = req.body;

  db.beginTransaction((err) => {
    if (err) {
      return res.status(500).send(err);
    }

    const createTransactionQuery =
      "INSERT INTO rentaltransaction ( Returned, CustomerID, Date) VALUES (0, ?, ?)";
    db.query(createTransactionQuery, [CustomerID, Date], (err, result) => {
      if (err) {
        return db.rollback(() => res.status(500).send(err));
      }

      const transactionID = result.insertId;

      const createRentedMovieQuery =
        "INSERT INTO rentedmovie (TransactionID, MovieID) VALUES (?, ?)";
      db.query(createRentedMovieQuery, [transactionID, MovieID], (err) => {
        if (err) {
          return db.rollback(() => res.status(500).send(err));
        }

        db.commit((err) => {
          if (err) {
            return res.status(500).send(err);
          }
          res.status(201).json({
            success: true,
            message: "Transaction created successfully",
          });
        });
      });
    });
  });
});

// SEND EMAIL TO USERS
// 1. CONFIGURE MAILGUN
const mg = mailgun({
  apiKey: "980a676075286f4b67e09382770a27f0-6fafb9bf-25a1386d",
  domain: "sandbox4a609dd27b2b488cbeef9fecc072c5f8.mailgun.org",
});

app.post("/send-email", (req, res) => {
  console.log(req.body);
  const { customerEmail, subject, message } = req.body;

  const data = {
    from: "kchaminiski123@gmail.com",
    to: customerEmail,
    subject: subject,
    text: message,
  };

  mg.messages().send(data, (error, body) => {
    if (error) {
      console.log(error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
    res.status(200).json({ success: true, message: "Email sent", body: body });
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// EMAIL API KEY  = 8c99b37e4f3347bfeab726799026e298-6fafb9bf-75feb4a2
// 8c99b37e4f3347bfeab726799026e298-6fafb9bf-75feb4a2
