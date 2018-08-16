package org.entermediadb.mediaboat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Collection;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

import org.apache.http.HttpEntity;
import org.apache.http.HttpResponse;
import org.apache.http.ParseException;
import org.apache.http.client.ClientProtocolException;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;
import org.entermediadb.utils.HttpMimeBuilder;
import org.entermediadb.utils.HttpSharedConnection;
import org.entermediadb.utils.OutputFiller;
import org.java_websocket.drafts.Draft_6455;
import org.json.simple.JSONArray;
import org.json.simple.JSONObject;



import sun.misc.IOUtils;

public class EnterMediaModel
{
	WsConnection connection;
	HttpSharedConnection httpconnection;
	OutputFiller fieldFiller;
	
	public OutputFiller getFiller()
	{
		if (fieldFiller == null)
		{
			fieldFiller = new OutputFiller();
		}
		return fieldFiller;
	}


	public void setFiller(OutputFiller inFiller)
	{
		fieldFiller = inFiller;
	}


	public HttpSharedConnection getHttpConnection()
	{
		if (httpconnection == null)
		{
			httpconnection = new HttpSharedConnection();
		}

		return httpconnection;
	}


	Configuration config = new Configuration();
	public Configuration getConfig()
	{
		return config;
	}

	public WsConnection getConnection()
	{
		if (connection == null)
		{
			try
			{
				String server = getConfig().get("server");
				int i;
				if( (i  = server.indexOf("/",8)) > -1)
				{
					//strip off /s
					server = server.substring(0, i);
				}
				server = server.substring(server.lastIndexOf("/") + 1);
				
				String url =  "ws://" + server + "/entermedia/services/websocket/org/entermediadb/websocket/mediaboat/MediaBoatConnection";
				url = url +  "?userid=" + getUserId();
				URI path = new URI(url);
				 // more about drafts here: http://github.com/TooTallNate/Java-WebSocket/wiki/Drafts
				connection = new WsConnection(path,new Draft_6455());
				connection.setEnterMediaModel(this);
			}
			catch(Exception ex)
			{
				throw new RuntimeException(ex);
			}
		}
		return connection;
	}
	//This class will be notified when they should move files around?


	private String getUserId()
	{
		return getConfig().get("username");
	}


	public boolean connect(String server, String inUname, String inKey)
	{
		
		String path = getConfig().get("home");
		if( path == null)
		{
			path = System.getenv("HOME");
			getConfig().put("home", path);
		}
		getConfig().put("username", inUname);
		getConfig().put("server", server);
		//check  for key
		getConfig().put("entermedia.key", inKey);
		getConfig().save();
		//Check disk space etc?
		connection = null;
		try
		{
			log("Connecting to " + getConnection().getURI());
			boolean ok = getConnection().connectBlocking();
			if( !ok )
			{
				log("Could not connect to " + getConnection().getURI());
				return false;
			}
			log("Connected to " + getConnection().getURI());
		}
		catch (InterruptedException e)
		{
			// TODO Auto-generated catch block
			e.printStackTrace();
			log("Error connecting to " + getConnection().getURI());
			return false;
		}
		Message mes = new Message("login");
		mes.put("home",path);
		mes.put("username",inUname);
		mes.put("server",server);
		mes.put("entermedia.key",inKey);
		mes.put("desktopid", System.getProperty("os.name") +  " " + getComputerName());
		mes.put("homefolder",path);
		getConnection().send(mes);
		return true;
		
	}

	protected String getComputerName()
	{
	    Map<String, String> env = System.getenv();
	    if (env.containsKey("COMPUTERNAME"))
	        return env.get("COMPUTERNAME");
	    else if (env.containsKey("HOSTNAME"))
	        return env.get("HOSTNAME");
	    else
	    {
	        try
			{
				return InetAddress.getLocalHost().getHostName();
			}
			catch (UnknownHostException e)
			{
				return "Unknown";
			}
	    }
	}

	private void log(String inString)
	{
		System.out.println(inString);
	}

	public void download(Collection inSourcepaths)
	{
		//The path is a collection path
		Map params = new HashMap();
		params.put("entermedia.key", getEnterMediaKey());
		for (Iterator iterator = inSourcepaths.iterator(); iterator.hasNext();)
		{
			Map downloadreq = (Map) iterator.next();
			String url = (String)downloadreq.get("url");
			HttpResponse res = getHttpConnection().sharedPost(url, params);
			InputStream input = null;
			FileOutputStream output = null;
			try
			{
				input = res.getEntity().getContent();
				String savepath = (String)downloadreq.get("savepath");
				File tosave = new File(savepath);
				tosave.getParentFile().mkdirs();
				output = new FileOutputStream(tosave);
				getFiller().fill(input, output);
				
				String savetime = (String)downloadreq.get("assetmodificationdate");
				tosave.setLastModified(Long.parseLong(savetime));
			}
			catch( Throwable ex)
			{
				//TODO Show errors
				getFiller().close(input);
				getFiller().close(output);
			}
			
		}
		
		//Loop over each thing and download it
		sendStatusComplete();
	}


	private String getEnterMediaKey()
	{
		return getConfig().get("entermedia.key");
	}


	public void sendStatusComplete()
	{
		//Send a message saying status 100%
		
	}


	public void disconnect()
	{
		getConnection().close();
	}


	public void sendFileList(Map inMap) {
		String fileroot = (String)inMap.get("rootfolder");
		String collectionid = (String) inMap.get("collectionid");
		String catalogid = (String) inMap.get("catalogid");
		
		Path path = Paths.get(fileroot);
		final JSONObject filelist = new JSONObject();
		final JSONArray files = new JSONArray();
		filelist.put("filelist", files);
		try {
			Files.walkFileTree(path, new SimpleFileVisitor<Path>() {
			    @Override
			    public FileVisitResult visitFile(
			            Path file,
			            BasicFileAttributes attrs) throws IOException {
			    	JSONObject fileinfo = new JSONObject();
			    	fileinfo.put("filename",file.getFileName().toFile().getName());
			    	fileinfo.put("fullpath",file.toFile().getAbsolutePath());
			    	fileinfo.put("size",file.getFileName().toFile().length());
			    	fileinfo.put("modificationdate",file.getFileName().toFile().lastModified());
			    	
			    	files.add(fileinfo);
			        return FileVisitResult.CONTINUE;
			    }

			    @Override
			    public FileVisitResult postVisitDirectory(
			            Path dir,
			            IOException exc) throws IOException {

			        //should we add empty folders?
			    	
			    	
			        return FileVisitResult.CONTINUE;
			    }
			});
		} catch (IOException e) {
			//TODO: log?
		}
		
		
		
		Message mes = new Message("handledesktopsync");
		mes.put("home",fileroot);
		mes.put("entermedia.key",getEnterMediaKey());
		mes.put("desktopid", System.getProperty("os.name") +  " " + getComputerName());
		mes.put("homefolder",fileroot);
		mes.put("filelist", files);
		mes.put("collectionid", collectionid);
		mes.put("catalogid", collectionid);
		mes.put("revision", inMap.get("revision"));
		getConnection().send(mes);
		
		
	}


	public void uploadFile(JSONObject inMap)
	{				
				try
				{
					String url = (String) inMap.get("uploadurl");				
					String filepath = (String) inMap.get("filepath");					
					String serverpath = (String) inMap.get("serverpath");

					
					
					
//					url  = "http://localhost:8080/openedit/views/filemanager/upload/uploadfile-finish.html?entermedia.key=" + getEnterMediaKey();
//					filepath = "/home/ian/testfile.tiff";
//					serverpath = "/test/new/folder/";
					
					File file = new File(filepath);
					HttpMimeBuilder builder = new HttpMimeBuilder();			
					
					
					//TODO: Use HttpRequestBuilder.addPart()
					HttpPost method = new HttpPost(url);
					//POST https://www.googleapis.com/upload/storage/v1/b/myBucket/o?uploadType=multipart
					builder.addPart("metadata", inMap.toJSONString(),"application/json"); //What should this be called?
					builder.addPart("file.0", file);
					builder.addPart("path", serverpath);
					
					method.setEntity(builder.build());

					HttpResponse resp = getHttpConnection().getSharedClient().execute(method);

					if (resp.getStatusLine().getStatusCode() != 200) {
						String returned = EntityUtils.toString(resp.getEntity());

					}
				}
				catch (Exception e)
				{
					// TODO Auto-generated catch block
					throw new RuntimeException(e);
				}
				

				
		
		
		
	}
	
	
}
