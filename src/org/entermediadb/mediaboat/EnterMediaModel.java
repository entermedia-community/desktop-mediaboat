package org.entermediadb.mediaboat;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Collection;
import java.util.Map;

public class EnterMediaModel
{
	WsConnection connection;
	Configuration config = new Configuration();
	public Configuration getConfig()
	{
		return config;
	}
	protected String fieldEnterMediaKey;
	
	
	public String getEnterMediaKey()
	{
		return fieldEnterMediaKey;
	}


	public void setEnterMediaKey(String inEnterMediaKey)
	{
		fieldEnterMediaKey = inEnterMediaKey;
	}


	public WsConnection getConnection()
	{
		if (connection == null)
		{
			try
			{
				String server = getConfig().get("server");
				int i;
				if( (i  = server.indexOf("/",4)) > -1)
				{
					//strip off /s
					server = server.substring(0, i);
				}
				String url =  "ws://" + server + "/entermedia/services/websocket/org/entermediadb/websocket/mediaboat/MediaBoatConnection";
				url = url +  "?userid=" + getUserId();
				URI path = new URI(url);
				 // more about drafts here: http://github.com/TooTallNate/Java-WebSocket/wiki/Drafts
				connection = new WsConnection(path);
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
		getConfig().put("key", inKey);
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
		mes.put("key",inKey);
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


	public void download(String inPath, Collection inSourcepaths)
	{
		//The path is a collection path
		
		//Loop over each thing and download it
		sendStatusComplete();
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
