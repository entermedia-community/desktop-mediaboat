package org.entermediadb.mediaboat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Collection;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

import org.apache.http.HttpResponse;
import org.entermediadb.utils.HttpSharedConnection;
import org.entermediadb.utils.OutputFiller;
import org.java_websocket.drafts.Draft_6455;

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
	
	//We should also upload files from the EnterMedia directory
	
	//Shuld be alerted when files are locally modified?
	
	
}
