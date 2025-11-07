# ClassViz

[Demo.](https://satrio.rukmono.id/classviz/?p=jhotdraw-5.1)

## Quick start with Python HTTP server

Because browsers block fetches of local files for security reasons, ClassViz must be served from a local web server rather than opened directly from disk. The simplest option is Python’s built-in HTTP server:

1. *Clone the repository*

   ```bash
   git clone https://github.com/rsatrioadi/classviz.git
   cd classviz
   ```

2. *Start a local server* using Python 3 (choose any port, e.g., 8000):

   ```bash
   # from the repository root
   python3 -m http.server 8000
   ```

   Python will host the directory at:
   [http://localhost:8000/](http://localhost:8000/)
   The original README uses `python -m http.server`; specifying a port is optional.

3. *Open the application* by visiting `http://localhost:8000/` in your browser. You can then either:

   * Click *Upload JSON* and select your graph file, or
   * Place your `.json` file in the `data/` directory and open:

     ```
     http://localhost:8000/?p=<filename-without-extension>
     ```

     On load, the application fetches
     `data/<filename>.json`.

4. *Use the interface*. The sidebar allows you to change layouts, colour modes, visibility, highlighting, traces, and more.
   Right-click dims elements; single-click selects and opens the info panel.

5. *Export your diagram* using:

   * *Download as SVG*, or
   * *Open SVG in new tab*

## Running with Docker

A `Dockerfile` is included for containerised deployment. It uses `nginx:alpine` and copies the entire project into `/usr/share/nginx/html`, serving the app on port 80.

1. *Build the image*:

   ```bash
   docker build -t classviz .
   ```

2. *Run the container*, mapping port 80 to your host:

   ```bash
   docker run --rm -p 8080:80 classviz
   ```

   Now visit:
   [http://localhost:8080/](http://localhost:8080/)

   Optionally, you may want to mount your local `data/` directory into the container (untested):

   ```bash
   docker run --rm -p 8080:80 \
     -v $(pwd)/data:/usr/share/nginx/html/data \
     classviz
   ```

3. *Rebuild when needed*; any code or data changes require rebuilding the image:

   ```bash
   docker build -t classviz .
   ```

